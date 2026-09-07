'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { getSessionUser } from '@/lib/auth'
import { CPF_ERROR, isValidCpf, stripCpf } from '@/lib/cpf'
import { createPixCharge, translateGatewayError, type PixCharge } from '@/lib/payments/misticpay'
import { ROBLOX_USERNAME_ERROR, ROBLOX_USERNAME_PATTERN } from '@/lib/roblox'
import { createAdminClient } from '@/lib/supabase/admin'

// =============================================================================
// CONTRATO DAS RPCs (definidas em supabase/migrations/)
// -----------------------------------------------------------------------------
// create_order(
//   p_items           jsonb,   -- [{ "product_id": uuid, "quantity": int }]
//   p_customer_email  text,
//   p_customer_name   text,
//   p_customer_phone  text,
//   p_coupon_code     text,
//   p_customer_note   text,
//   p_user_id         uuid,    -- null = convidado
//   p_ip              text,    -- convertido para inet dentro da função
//   p_user_agent      text,
//   p_roblox_username text,    -- exigido quando algum item pede (0016)
//   p_customer_document text   -- CPF, exigido pelo gateway de Pix (0017)
// ) returns table (order_id uuid, order_number int, total_cents int)
//
// A RPC é a ÚNICA fonte de verdade de preço: ela relê products.price_cents,
// aplica o cupom, reserva estoque e grava pedido + itens na mesma transação.
// O price_cents que o carrinho carrega no browser é decorativo — nada do que
// o cliente manda sobre dinheiro chega ao banco.
//
// compute_coupon_discount(
//   p_code text, p_subtotal_cents int, p_email text
// ) returns table (valid boolean, reason text, discount_cents int)
// =============================================================================

// -----------------------------------------------------------------------------
// RATE LIMIT — 10 pedidos por IP a cada 5 minutos.
//
// Este Map vive na memória do processo Node. Numa instância só ele segura o que
// precisa segurar: duplo-clique no botão de finalizar e script raso batendo em
// loop. O que ele NÃO faz é valer para o site inteiro quando há mais de uma
// instância — na Vercel cada lambda sobe com o seu próprio Map, então o limite
// efetivo vira 10 × (número de instâncias vivas), e um deploy zera todos os
// contadores. Quando isso passar a importar, trocar por contador compartilhado:
// Upstash Redis (@upstash/ratelimit) é a troca mais curta — mesma chamada aqui,
// um INCR com TTL no lugar do Map.
// -----------------------------------------------------------------------------
const ORDER_RATE_LIMIT = 10
const ORDER_RATE_WINDOW_MS = 5 * 60 * 1000
const orderRateBuckets = new Map<string, { count: number; resetAt: number }>()

/** O Map só cresce sozinho. Varre os expirados quando ficar grande. */
function sweepExpiredBuckets(now: number): void {
  if (orderRateBuckets.size < 5_000) return
  for (const [key, bucket] of orderRateBuckets) {
    if (bucket.resetAt <= now) orderRateBuckets.delete(key)
  }
}

function checkOrderRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  sweepExpiredBuckets(now)

  const bucket = orderRateBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    orderRateBuckets.set(key, { count: 1, resetAt: now + ORDER_RATE_WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= ORDER_RATE_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

// -----------------------------------------------------------------------------
// Contexto da requisição
// -----------------------------------------------------------------------------
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-f:]+$/i

async function readClientContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers()

  // x-forwarded-for = "cliente, proxy1, proxy2". O primeiro valor é o cliente;
  // os demais são os saltos até aqui.
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim()
  const raw = forwarded || headerList.get('x-real-ip')?.trim() || ''

  // orders.ip_address é `inet`: qualquer coisa que não seja IP derruba o insert
  // dentro da transação da RPC. Melhor gravar null do que perder o pedido.
  const ip = raw && (IPV4_RE.test(raw) || IPV6_RE.test(raw)) ? raw : null

  const userAgent = headerList.get('user-agent')?.slice(0, 500) || null

  return { ip, userAgent }
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/** Campo de formulário: "" e espaços em branco viram undefined antes de validar. */
function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Aceita number ou string numérica — <input> e <select> devolvem string. */
function toNumber(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

const orderItemSchema = z.object({
  product_id: z.uuid('Há um produto inválido no carrinho.'),
  quantity: z.preprocess(
    toNumber,
    z
      .number('Quantidade inválida.')
      .int('A quantidade precisa ser um número inteiro.')
      .min(1, 'A quantidade mínima é 1.')
      .max(100, 'A quantidade máxima por item é 100.')
  ),
})

const createOrderSchema = z.object({
  items: z
    .array(orderItemSchema)
    .min(1, 'Seu carrinho está vazio.')
    .max(50, 'São no máximo 50 itens diferentes por pedido.'),

  customer_email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email('Informe um e-mail válido para receber o pedido.').max(160, 'E-mail longo demais.')
  ),

  /**
   * Obrigatório desde a troca para a MisticPay: a criação da cobrança Pix
   * exige `payerName`. Antes era opcional, quando a Stripe se virava só com
   * o e-mail.
   */
  customer_name: z.preprocess(
    emptyToUndefined,
    z
      .string('Informe o seu nome completo.')
      .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
      .max(120, 'O nome pode ter no máximo 120 caracteres.')
  ),

  /**
   * CPF do pagador — exigido pela API do gateway (`payerDocument`).
   * Valida o dígito verificador, não só o tamanho: erro de digitação aqui só
   * apareceria com o pedido criado e o estoque já reservado.
   */
  customer_document: z.preprocess(
    (value) => (typeof value === 'string' ? stripCpf(value) : value),
    z.string('Informe o seu CPF.').refine(isValidCpf, CPF_ERROR)
  ),

  customer_phone: z.preprocess(
    emptyToUndefined,
    z.string().max(24, 'Telefone longo demais.').optional()
  ),

  coupon_code: z.preprocess(
    (value) => {
      const normalized = emptyToUndefined(value)
      return typeof normalized === 'string' ? normalized.toUpperCase() : normalized
    },
    z.string().max(40, 'Cupom inválido.').optional()
  ),

  customer_note: z.preprocess(
    emptyToUndefined,
    z.string().max(500, 'A observação pode ter no máximo 500 caracteres.').optional()
  ),

  /**
   * Opcional aqui de propósito: quem decide se é obrigatório são os produtos do
   * carrinho, e essa conta é feita no banco (create_order). Exigir sempre
   * travaria a venda de conta, que não precisa de nick.
   */
  roblox_username: z.preprocess(
    emptyToUndefined,
    z.string().regex(ROBLOX_USERNAME_PATTERN, ROBLOX_USERNAME_ERROR).optional()
  ),

  accept_terms: z.literal(true, 'Você precisa aceitar os termos de compra para continuar.'),
})

const checkoutRequirementsSchema = z.object({
  product_ids: z
    .array(z.uuid('Há um produto inválido no carrinho.'))
    .max(50, 'São no máximo 50 itens diferentes por pedido.'),
})

const validateCouponSchema = z.object({
  code: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().min(1, 'Digite um cupom.').max(40, 'Cupom inválido.')
  ),
  subtotal_cents: z.preprocess(
    toNumber,
    z
      .number('Subtotal inválido.')
      .int('Subtotal inválido.')
      .min(0, 'Subtotal inválido.')
      .max(100_000_000, 'Subtotal inválido.')
  ),
  email: z.preprocess(
    (value) => {
      const normalized = emptyToUndefined(value)
      return typeof normalized === 'string' ? normalized.toLowerCase() : normalized
    },
    z.email('E-mail inválido.').max(160, 'E-mail longo demais.').optional()
  ),
})

export type CreateOrderInput = z.input<typeof createOrderSchema>
export type ValidateCouponInput = z.input<typeof validateCouponSchema>
export type CheckoutRequirementsInput = z.input<typeof checkoutRequirementsSchema>

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: number }
  | { ok: false; error: string; orderId?: string; orderNumber?: number }

export interface ValidateCouponResult {
  ok: boolean
  error?: string
  valid: boolean
  reason: string | null
  discount_cents: number
}

export interface CheckoutRequirementsResult {
  /** Algum produto do carrinho entrega dentro do jogo e precisa do nick. */
  requiresRobloxUsername: boolean
  /** Nomes dos produtos que exigem — a tela diz POR QUE está pedindo o dado. */
  robloxProductNames: string[]
}

// -----------------------------------------------------------------------------
// Tradução de erro
// -----------------------------------------------------------------------------
interface DbErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/**
 * A RPC levanta os erros de negócio com `raise exception`, que sai com SQLSTATE
 * P0001 e mensagem já escrita em português ("Estoque insuficiente para X").
 * Essas passam direto para a tela.
 *
 * Qualquer outro código é falha técnica: registra no servidor e devolve texto
 * genérico. Mensagem crua do Postgres na tela entrega nome de tabela, de coluna
 * e de constraint para quem estiver sondando.
 */
function translateDbError(error: DbErrorLike, context: string, fallback: string): string {
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (code === 'P0001' && message) return message

  console.error(`[${context}]`, {
    code,
    message,
    details: error.details,
    hint: error.hint,
  })

  const known: Record<string, string> = {
    '23505': 'Este pedido já foi registrado.',
    '23503': 'Um dos produtos do carrinho não existe mais.',
    '23514': 'Os dados do pedido não passaram na validação do servidor.',
    '22P02': 'Há um dado inválido no pedido.',
    '40001': 'Muita gente comprando ao mesmo tempo. Tente de novo em instantes.',
    '40P01': 'Muita gente comprando ao mesmo tempo. Tente de novo em instantes.',
    '55P03': 'O estoque está sendo atualizado. Tente de novo em instantes.',
    '57014': 'A operação demorou demais. Tente de novo.',
    PGRST202: 'Checkout indisponível no momento. Tente novamente mais tarde.',
  }

  return known[code] ?? fallback
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

// -----------------------------------------------------------------------------
// Normalização do retorno das RPCs
//
// `returns table (...)` chega como array de linhas; `returns record`/`json`
// chega como objeto. Aceitar os dois evita que uma escolha de tipo na migration
// quebre o checkout em produção.
// -----------------------------------------------------------------------------
interface CreateOrderRow {
  order_id: string
  order_number: number
  total_cents: number
}

function normalizeOrderRow(data: unknown): CreateOrderRow | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  const orderId = record.order_id ?? record.id
  const orderNumber = record.order_number
  const totalCents = record.total_cents

  if (typeof orderId !== 'string') return null
  if (typeof orderNumber !== 'number') return null
  if (typeof totalCents !== 'number') return null

  return { order_id: orderId, order_number: orderNumber, total_cents: totalCents }
}

function normalizeCouponRow(
  data: unknown
): { valid: boolean; reason: string | null; discount_cents: number } | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  const valid = record.valid
  const reason = record.reason
  const discount = record.discount_cents

  if (typeof valid !== 'boolean') return null

  return {
    valid,
    reason: typeof reason === 'string' && reason !== '' ? reason : null,
    discount_cents: typeof discount === 'number' ? discount : 0,
  }
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Cria o pedido. NÃO redireciona: devolve o resultado e a página de checkout
 * decide para onde navegar. Redirect dentro da action lança NEXT_REDIRECT, que
 * o try/catch de quem chama engoliria — e o cliente ficaria sem feedback.
 */
export async function createOrderAction(input: unknown): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, 'Confira os dados do pedido.') }
  }
  const data = parsed.data

  // (a) Sessão. null aqui é compra de convidado, não é erro — quem manda no
  // acesso é o RLS/RPC, não esta linha.
  const user = await getSessionUser()

  // (b) IP e user-agent, para a trilha antifraude gravada em orders.
  const { ip, userAgent } = await readClientContext()

  // Sem IP identificável (dev local, proxy mal configurado) todos caem no mesmo
  // balde. É o lado conservador do erro: limita demais em vez de não limitar.
  const rate = checkOrderRateLimit(ip ?? 'sem-ip')
  if (!rate.allowed) {
    const minutes = Math.max(1, Math.ceil(rate.retryAfterSeconds / 60))
    return {
      ok: false,
      error: `Muitas tentativas de compra deste dispositivo. Tente de novo em ${minutes} minuto${
        minutes > 1 ? 's' : ''
      }.`,
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error('[createOrderAction:admin-client]', error)
    return { ok: false, error: 'Checkout indisponível no momento. Tente novamente em instantes.' }
  }

  // (c) A RPC recalcula preço, aplica cupom e reserva estoque numa transação só.
  let rpcData: unknown
  try {
    const { data: result, error } = await admin.rpc('create_order', {
      p_items: data.items,
      p_customer_email: data.customer_email,
      p_customer_name: data.customer_name,
      p_customer_phone: data.customer_phone ?? null,
      p_customer_document: data.customer_document,
      p_coupon_code: data.coupon_code ?? null,
      p_customer_note: data.customer_note ?? null,
      p_user_id: user?.id ?? null,
      p_ip: ip,
      p_user_agent: userAgent,
      p_roblox_username: data.roblox_username ?? null,
    })

    // (d) Erro de negócio da RPC: a mensagem já vem pronta em português.
    if (error) {
      return {
        ok: false,
        error: translateDbError(
          error,
          'createOrderAction:rpc',
          'Não foi possível concluir o pedido. Tente novamente.'
        ),
      }
    }

    rpcData = result
  } catch (error) {
    console.error('[createOrderAction:rpc-throw]', error)
    return { ok: false, error: 'Não foi possível concluir o pedido agora. Tente novamente.' }
  }

  const order = normalizeOrderRow(rpcData)
  if (!order) {
    // Pedido pode ter sido criado. Não mandar "tente de novo" aqui: repetir
    // geraria um segundo pedido e reservaria estoque duas vezes.
    console.error('[createOrderAction:resposta-inesperada]', rpcData)
    return {
      ok: false,
      error:
        'O pedido foi enviado, mas não conseguimos confirmar o número. ' +
        'Confira em "Meus pedidos" antes de tentar de novo.',
    }
  }

  // (e) Cobrança Pix no gateway.
  //
  // O valor vem de order.total_cents, que a RPC recalculou do banco — nada do
  // que o cliente mandou sobre dinheiro chega até aqui.
  let charge: PixCharge
  try {
    charge = await createPixCharge({
      orderId: order.order_id,
      orderNumber: order.order_number,
      amountCents: order.total_cents,
      customerName: data.customer_name,
      customerDocument: data.customer_document,
    })
  } catch (error) {
    // A cobrança falhou, mas o pedido já existe e o estoque está RESERVADO.
    // Deixá-lo pendente prenderia chaves que ninguém vai pagar até o pedido
    // expirar. Cancelar devolve tudo ao pool na hora.
    const { error: cancelError } = await admin.rpc('cancel_order', {
      p_order_id: order.order_id,
      p_reason: 'Falha ao gerar a cobrança no gateway',
    })
    if (cancelError) {
      // Não dá para reverter: o estoque fica preso até alguém cancelar à mão.
      console.error('[createOrderAction:cancelamento-falhou]', order.order_id, cancelError)
    }

    return { ok: false, error: translateGatewayError(error) }
  }

  // (f) Guarda o QR e o id do gateway. O webhook encontra o pedido por este id.
  const { error: paymentError } = await admin.from('payments').insert({
    order_id: order.order_id,
    provider: 'misticpay',
    provider_payment_id: charge.paymentIntentId,
    method: 'pix',
    status: 'pending',
    amount_cents: order.total_cents,
    qr_code: charge.qrCodeImageUrl,
    qr_code_text: charge.qrCodeText,
    expires_at: charge.expiresAt,
  })

  if (paymentError) {
    // Aqui a cobrança JÁ EXISTE no gateway e o cliente pode pagar a qualquer
    // momento. Cancelar o pedido agora criaria o pior caso: dinheiro entrando
    // sem pedido correspondente.
    //
    // MUDOU COM A TROCA DE GATEWAY: a Stripe carregava order_id no metadata do
    // PaymentIntent, então o webhook reencontrava o pedido mesmo sem esta
    // linha. A MisticPay não devolve a nossa referência no webhook — só o id
    // dela. Esta linha é o ÚNICO vínculo entre transação e pedido, e sem ela o
    // webhook responde "transacao desconhecida" e o cliente paga sem receber.
    //
    // Por isso: uma segunda tentativa antes de desistir (a falha típica é
    // instabilidade momentânea), e log com os dois ids para reconciliar à mão.
    const { error: retryError } = await admin.from('payments').insert({
      order_id: order.order_id,
      provider: 'misticpay',
      provider_payment_id: charge.paymentIntentId,
      method: 'pix',
      status: 'pending',
      amount_cents: order.total_cents,
      qr_code: charge.qrCodeImageUrl,
      qr_code_text: charge.qrCodeText,
      expires_at: charge.expiresAt,
    })

    if (!retryError) {
      return { ok: true, orderId: order.order_id, orderNumber: order.order_number }
    }

    console.error(
      '[createOrderAction:payment-insert] VINCULO PERDIDO — reconciliar a mao',
      { orderId: order.order_id, orderNumber: order.order_number, transactionId: charge.paymentIntentId },
      paymentError,
      retryError
    )
    return {
      ok: false,
      error: `Seu pedido #${order.order_number} foi criado. Abra a página do pedido para concluir o pagamento.`,
      orderId: order.order_id,
      orderNumber: order.order_number,
    }
  }

  return { ok: true, orderId: order.order_id, orderNumber: order.order_number }
}

/**
 * Pré-visualização do desconto no carrinho. É só para a tela: o desconto que
 * vale é o que create_order() recalcula na hora de fechar o pedido.
 */
export async function validateCouponAction(input: unknown): Promise<ValidateCouponResult> {
  const parsed = validateCouponSchema.safeParse(input)
  if (!parsed.success) {
    const message = firstIssue(parsed.error, 'Cupom inválido.')
    return { ok: false, error: message, valid: false, reason: message, discount_cents: 0 }
  }
  const data = parsed.data

  try {
    const admin = createAdminClient()
    const { data: result, error } = await admin.rpc('compute_coupon_discount', {
      p_code: data.code,
      p_subtotal_cents: data.subtotal_cents,
      p_email: data.email ?? null,
    })

    if (error) {
      const message = translateDbError(
        error,
        'validateCouponAction:rpc',
        'Não foi possível validar o cupom agora.'
      )
      return { ok: false, error: message, valid: false, reason: message, discount_cents: 0 }
    }

    const coupon = normalizeCouponRow(result)
    if (!coupon) {
      console.error('[validateCouponAction:resposta-inesperada]', result)
      const message = 'Não foi possível validar o cupom agora.'
      return { ok: false, error: message, valid: false, reason: message, discount_cents: 0 }
    }

    return {
      ok: true,
      valid: coupon.valid,
      reason: coupon.reason ?? (coupon.valid ? null : 'Cupom inválido.'),
      discount_cents: coupon.valid ? coupon.discount_cents : 0,
    }
  } catch (error) {
    console.error('[validateCouponAction]', error)
    const message = 'Não foi possível validar o cupom agora.'
    return { ok: false, error: message, valid: false, reason: message, discount_cents: 0 }
  }
}

/**
 * O checkout pergunta ao servidor se o carrinho exige o nick do Roblox.
 *
 * Por que não guardar a flag no item do carrinho: o carrinho vive no
 * localStorage e pode ter semanas. Um carrinho montado antes de o admin ligar a
 * exigência no produto não teria a flag, o campo não apareceria e create_order
 * recusaria o pedido — becos sem saída para quem só queria comprar.
 * Perguntar na hora custa uma ida ao servidor e nunca fica desatualizado.
 *
 * Isto é só para a TELA. A exigência de verdade é aplicada em create_order.
 */
export async function checkoutRequirementsAction(
  input: unknown
): Promise<CheckoutRequirementsResult> {
  const vazio: CheckoutRequirementsResult = {
    requiresRobloxUsername: false,
    robloxProductNames: [],
  }

  const parsed = checkoutRequirementsSchema.safeParse(input)
  if (!parsed.success || parsed.data.product_ids.length === 0) return vazio

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('products')
      .select('name')
      .in('id', parsed.data.product_ids)
      .eq('status', 'active')
      .eq('requires_roblox_username', true)

    if (error) {
      // Falhar aqui não pode travar o checkout: o campo fica escondido e, se
      // algum item exigir mesmo, create_order recusa com mensagem clara.
      console.error('[checkoutRequirementsAction]', error)
      return vazio
    }

    const names = (data ?? [])
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')

    return { requiresRobloxUsername: names.length > 0, robloxProductNames: names }
  } catch (error) {
    console.error('[checkoutRequirementsAction]', error)
    return vazio
  }
}
