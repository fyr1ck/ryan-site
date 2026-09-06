'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission, DigitalContentType, OrderStatus } from '@/lib/types/database.types'
import { formatDateTime } from '@/lib/utils'

// =============================================================================
// OPERAÇÃO DE PEDIDOS
// -----------------------------------------------------------------------------
// Duas famílias de escrita convivem aqui, e a diferença importa:
//
//   1. RPCs transacionais (mark_order_paid, cancel_order). Elas mexem em
//      estoque, cupom e entrega na mesma transação. A migration 0006 as REVOGA
//      de anon/authenticated de propósito — ninguém marca um pedido como pago
//      pelo PostgREST. Por isso aqui elas passam pelo createAdminClient()
//      (service_role), e a autorização real vira responsabilidade deste
//      arquivo: requirePermission('orders.write') ANTES de qualquer coisa.
//
//   2. UPDATEs simples em `orders` (status, nota). Esses vão pelo client de
//      sessão, porque existe policy `orders_admin_write` cobrindo exatamente
//      isso. Client de sessão = RLS ligado = uma camada a mais de proteção.
//
// digital_deliveries só tem policy de SELECT (0007). O INSERT da entrega manual
// portanto também precisa do service_role — está comentado no ponto de uso.
// =============================================================================

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface RevealResult extends ActionResult {
  content?: string
  contentType?: DigitalContentType
}

// -----------------------------------------------------------------------------
// Helpers locais (repetidos por arquivo de action de propósito: cada módulo de
// action é autocontido e não depende de um "utils de action" compartilhado).
// -----------------------------------------------------------------------------

/** requirePermission lança; a UI do painel espera `{ ok, error }`. */
async function authorize(
  permission: AppPermission
): Promise<{ user: SessionUser } | { error: string }> {
  try {
    return { user: await requirePermission(permission) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sem permissão para esta ação.' }
  }
}

/**
 * Auditoria. Falha de log NUNCA derruba a operação já concluída — mas vai para
 * o console do servidor, que é onde alguém consegue perceber o buraco.
 */
async function logAction(
  actorId: string,
  action: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('log_admin_action', {
      p_actor_id: actorId,
      p_action: action,
      p_entity_type: 'order',
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    })
  } catch (error) {
    console.error('[log_admin_action:order]', action, error)
  }
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

interface DbErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** P0001 é erro de negócio levantado pela RPC: a mensagem já vem em português. */
function translateDbError(error: DbErrorLike, context: string, fallback: string): string {
  const code = error.code ?? ''
  if (code === 'P0001' && error.message) return error.message

  const known: Record<string, string> = {
    '42501': 'Sem permissão para esta operação.',
    '23514': 'A operação não passou na validação do servidor.',
    '22P02': 'Há um dado inválido na requisição.',
    '40001': 'O pedido está sendo alterado por outra pessoa. Tente de novo.',
    '55P03': 'O pedido está travado por outra operação. Tente de novo em instantes.',
    PGRST202: 'Operação indisponível no momento.',
  }
  if (known[code]) return known[code]

  console.error(`[${context}]`, {
    code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
  return fallback
}

function revalidateOrder(orderId: string): void {
  revalidatePath('/admin/pedidos')
  revalidatePath(`/admin/pedidos/${orderId}`)
  revalidatePath('/admin')
  revalidatePath('/conta/pedidos')
}

// =============================================================================
// 1. MARCAR COMO PAGO
// =============================================================================
const orderIdSchema = z.uuid('Pedido inválido.')

/**
 * Confirma o pagamento manualmente (Pix conferido no extrato, por exemplo).
 *
 * A RPC mark_order_paid é idempotente: chamar duas vezes não entrega duas
 * vezes nem soma o cupom de novo. Ela também é a única que sabe converter
 * reserva em venda e gerar as entregas automáticas.
 */
export async function markOrderPaidAction(orderId: unknown): Promise<ActionResult> {
  const parsed = orderIdSchema.safeParse(orderId)
  if (!parsed.success) return { ok: false, error: 'Pedido inválido.' }

  const auth = await authorize('orders.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    // service_role: a RPC é revogada de `authenticated` na migration 0006 para
    // que ninguém confirme pagamento direto pelo PostgREST. A autorização já
    // foi feita acima — este client não checa nada sozinho.
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('mark_order_paid', { p_order_id: parsed.data })

    if (error) {
      return {
        ok: false,
        error: translateDbError(
          error,
          'markOrderPaidAction:rpc',
          'Não foi possível confirmar o pagamento.'
        ),
      }
    }

    const result = (data ?? {}) as { already_paid?: boolean; delivered_items?: number }

    await logAction(
      auth.user.id,
      'order.mark_paid',
      parsed.data,
      result.already_paid
        ? 'Pagamento já estava confirmado (sem reprocessamento).'
        : 'Pagamento confirmado manualmente.',
      { already_paid: result.already_paid ?? false, delivered_items: result.delivered_items ?? 0 }
    )

    revalidateOrder(parsed.data)
    return { ok: true }
  } catch (error) {
    console.error('[markOrderPaidAction]', error)
    return { ok: false, error: 'Não foi possível confirmar o pagamento agora.' }
  }
}

// =============================================================================
// 2. CANCELAR
// =============================================================================
const cancelSchema = z.object({
  orderId: z.uuid('Pedido inválido.'),
  reason: z
    .string()
    .trim()
    .min(3, 'Escreva o motivo do cancelamento (mínimo 3 caracteres).')
    .max(500, 'O motivo pode ter no máximo 500 caracteres.'),
})

/**
 * Cancela e devolve ao pool o estoque que estava reservado. É por isso que
 * cancelar NÃO é um UPDATE de status: o estoque ficaria preso para sempre.
 */
export async function cancelOrderAction(orderId: unknown, reason: unknown): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse({ orderId, reason })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('orders.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    // Mesma razão do mark_order_paid: RPC revogada de authenticated.
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('cancel_order', {
      p_order_id: parsed.data.orderId,
      p_reason: parsed.data.reason,
    })

    if (error) {
      return {
        ok: false,
        error: translateDbError(
          error,
          'cancelOrderAction:rpc',
          'Não foi possível cancelar o pedido.'
        ),
      }
    }

    const result = (data ?? {}) as { already_cancelled?: boolean }

    await logAction(
      auth.user.id,
      'order.cancel',
      parsed.data.orderId,
      result.already_cancelled
        ? 'Pedido já estava cancelado.'
        : `Pedido cancelado: ${parsed.data.reason}`,
      { reason: parsed.data.reason, already_cancelled: result.already_cancelled ?? false }
    )

    revalidateOrder(parsed.data.orderId)
    return { ok: true }
  } catch (error) {
    console.error('[cancelOrderAction]', error)
    return { ok: false, error: 'Não foi possível cancelar o pedido agora.' }
  }
}

// =============================================================================
// 3. ATUALIZAR STATUS
// =============================================================================
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  processing: 'Processando',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const updateStatusSchema = z.object({
  orderId: z.uuid('Pedido inválido.'),
  status: z.enum(['pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded']),
})

/**
 * Move o pedido no fluxo operacional.
 *
 * Dois destinos são recusados de propósito: `paid` e `cancelled` têm efeito
 * colateral (baixa de estoque / devolução de reserva / entrega automática) que
 * só as RPCs sabem fazer. Deixar o admin escolher esses dois num <select>
 * criaria pedido "pago" sem entrega e estoque reservado para sempre.
 */
export async function updateOrderStatusAction(
  orderId: unknown,
  status: unknown
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse({ orderId, status })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'Status inválido.') }

  const { orderId: id, status: next } = parsed.data

  if (next === 'paid') {
    return {
      ok: false,
      error: 'Use "Marcar como pago": só a RPC confirma pagamento, baixa estoque e entrega.',
    }
  }
  if (next === 'cancelled') {
    return {
      ok: false,
      error: 'Use "Cancelar pedido": só a RPC devolve o estoque reservado ao pool.',
    }
  }

  const auth = await authorize('orders.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    // Client de sessão: existe policy orders_admin_write para este UPDATE.
    const supabase = await createClient()

    const { data: current, error: readError } = await supabase
      .from('orders')
      .select('id, status, completed_at')
      .eq('id', id)
      .maybeSingle()

    if (readError) {
      return {
        ok: false,
        error: translateDbError(readError, 'updateOrderStatusAction:read', 'Pedido não encontrado.'),
      }
    }
    if (!current) return { ok: false, error: 'Pedido não encontrado.' }
    if (current.status === next) return { ok: true }

    const patch: Record<string, unknown> = { status: next }

    // completed_at é a data em que o cliente passou a ter o produto na mão.
    // Só nasce uma vez: reabrir e concluir de novo não reescreve a original.
    if (next === 'completed') {
      patch.completed_at = current.completed_at ?? new Date().toISOString()
    }
    // Reembolso é fato financeiro: o payment_status precisa acompanhar, senão
    // o pedido continua contando como receita no dashboard.
    if (next === 'refunded') {
      patch.payment_status = 'refunded'
    }

    const { error } = await supabase.from('orders').update(patch).eq('id', id)

    if (error) {
      return {
        ok: false,
        error: translateDbError(
          error,
          'updateOrderStatusAction:update',
          'Não foi possível atualizar o status.'
        ),
      }
    }

    await logAction(
      auth.user.id,
      'order.update_status',
      id,
      `Status alterado de ${STATUS_LABEL[current.status as OrderStatus] ?? current.status} para ${STATUS_LABEL[next]}.`,
      { from: current.status, to: next }
    )

    revalidateOrder(id)
    return { ok: true }
  } catch (error) {
    console.error('[updateOrderStatusAction]', error)
    return { ok: false, error: 'Não foi possível atualizar o status agora.' }
  }
}

// =============================================================================
// 4. NOTA ADMINISTRATIVA
// =============================================================================
const noteSchema = z.object({
  orderId: z.uuid('Pedido inválido.'),
  note: z
    .string()
    .trim()
    .min(2, 'Escreva a nota (mínimo 2 caracteres).')
    .max(2000, 'A nota pode ter no máximo 2000 caracteres.'),
})

/**
 * Anexa uma nota interna ao pedido.
 *
 * `orders.admin_note` é um campo de texto só, então a nota é ACRESCENTADA com
 * data e autor — nunca substitui o que já estava lá. O ler-e-gravar não é
 * atômico: se dois admins escreverem no mesmo segundo, uma nota se perde. É
 * aceito de propósito enquanto isso for um campo de texto; o dia em que virar
 * tabela `order_notes`, este append sai daqui.
 */
export async function addOrderNoteAction(orderId: unknown, note: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse({ orderId, note })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('orders.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: current, error: readError } = await supabase
      .from('orders')
      .select('id, admin_note')
      .eq('id', parsed.data.orderId)
      .maybeSingle()

    if (readError || !current) {
      return { ok: false, error: 'Pedido não encontrado.' }
    }

    const stamp = `[${formatDateTime(new Date())} · ${auth.user.email}]`
    const line = `${stamp} ${parsed.data.note}`
    const merged = current.admin_note ? `${current.admin_note}\n${line}` : line

    const { error } = await supabase
      .from('orders')
      .update({ admin_note: merged })
      .eq('id', parsed.data.orderId)

    if (error) {
      return {
        ok: false,
        error: translateDbError(error, 'addOrderNoteAction:update', 'Não foi possível salvar a nota.'),
      }
    }

    await logAction(auth.user.id, 'order.note', parsed.data.orderId, 'Nota administrativa adicionada.', {
      length: parsed.data.note.length,
    })

    revalidateOrder(parsed.data.orderId)
    return { ok: true }
  } catch (error) {
    console.error('[addOrderNoteAction]', error)
    return { ok: false, error: 'Não foi possível salvar a nota agora.' }
  }
}

// =============================================================================
// 5. ENTREGA MANUAL
// =============================================================================
const deliverSchema = z.object({
  orderItemId: z.uuid('Item do pedido inválido.'),
  content: z
    .string()
    .trim()
    .min(1, 'Escreva o conteúdo que será entregue ao cliente.')
    .max(5000, 'O conteúdo pode ter no máximo 5000 caracteres.'),
})

interface OrderItemDeliveryRow {
  id: string
  order_id: string
  product_name: string
  products: { delivery_type: string } | null
}

/**
 * Entrega escrita à mão pelo admin (conta criada, item enviado no jogo, etc).
 *
 * Depois de gravar, recalcula se ainda resta item MANUAL sem entrega. Se não
 * restar e o pedido estiver pago, ele vira `completed` — é a mesma regra que a
 * mark_order_paid aplica para pedidos 100% automáticos.
 */
export async function deliverManuallyAction(
  orderItemId: unknown,
  content: unknown
): Promise<ActionResult> {
  const parsed = deliverSchema.safeParse({ orderItemId, content })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('orders.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: itemRaw, error: itemError } = await supabase
      .from('order_items')
      .select('id, order_id, product_name, products(delivery_type)')
      .eq('id', parsed.data.orderItemId)
      .maybeSingle()

    if (itemError || !itemRaw) {
      return { ok: false, error: 'Item do pedido não encontrado.' }
    }
    const item = itemRaw as unknown as OrderItemDeliveryRow

    const { data: order } = await supabase
      .from('orders')
      .select('id, status, payment_status')
      .eq('id', item.order_id)
      .maybeSingle()

    if (!order) return { ok: false, error: 'Pedido não encontrado.' }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      return { ok: false, error: 'Este pedido está cancelado — não é possível entregar.' }
    }

    // service_role: digital_deliveries só tem policy de SELECT (0007). O INSERT
    // não é liberado a `authenticated` justamente para que a única entrada de
    // conteúdo entregue seja código de servidor com permissão já verificada.
    const admin = createAdminClient()

    const { error: insertError } = await admin.from('digital_deliveries').insert({
      order_id: item.order_id,
      order_item_id: item.id,
      manual_content: parsed.data.content,
      delivered_by: auth.user.id,
    })

    if (insertError) {
      return {
        ok: false,
        error: translateDbError(
          insertError,
          'deliverManuallyAction:insert',
          'Não foi possível registrar a entrega.'
        ),
      }
    }

    // ---- O pedido ainda tem item manual pendente? -------------------------
    const [{ data: itemsRaw }, { data: deliveredRaw }] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, products(delivery_type)')
        .eq('order_id', item.order_id),
      supabase.from('digital_deliveries').select('order_item_id').eq('order_id', item.order_id),
    ])

    const delivered = new Set((deliveredRaw ?? []).map((row) => row.order_item_id as string))
    const items = (itemsRaw ?? []) as unknown as OrderItemDeliveryRow[]

    // Produto apagado (products = null) conta como manual: é o lado conservador
    // do erro — melhor pedir uma conferência humana do que concluir sozinho.
    const pending = items.filter(
      (row) => (row.products?.delivery_type ?? 'manual') === 'manual' && !delivered.has(row.id)
    )

    let completed = false
    if (pending.length === 0 && order.payment_status === 'paid' && order.status !== 'completed') {
      const { error: completeError } = await supabase
        .from('orders')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', item.order_id)

      if (completeError) {
        console.error('[deliverManuallyAction:complete]', completeError)
      } else {
        completed = true
      }
    }

    // METADATA NUNCA LEVA O CONTEÚDO. O log é lido por qualquer admin com
    // logs.read; gravar a chave ali vazaria o segredo para fora do controle
    // de inventory.read.
    await logAction(
      auth.user.id,
      'order.deliver_manual',
      item.order_id,
      `Entrega manual registrada para "${item.product_name}".${completed ? ' Pedido concluído.' : ''}`,
      {
        order_item_id: item.id,
        content_length: parsed.data.content.length,
        order_completed: completed,
      }
    )

    revalidateOrder(item.order_id)
    return { ok: true }
  } catch (error) {
    console.error('[deliverManuallyAction]', error)
    return { ok: false, error: 'Não foi possível registrar a entrega agora.' }
  }
}

// =============================================================================
// 6. REVELAR CONTEÚDO ENTREGUE
// =============================================================================
interface DeliveryRevealRow {
  id: string
  order_id: string
  manual_content: string | null
  digital_stock_items: { content: string; content_type: DigitalContentType } | null
}

/**
 * Devolve o conteúdo real de UMA entrega e registra a visualização.
 *
 * O conteúdo não é mandado junto com a página: a tela renderiza só a máscara e
 * chama isto quando o admin aperta "Revelar". Assim o segredo só sai do
 * servidor quando alguém pede — e cada pedido vira uma linha em admin_logs.
 */
export async function revealDeliveryAction(deliveryId: unknown): Promise<RevealResult> {
  const parsed = z.uuid('Entrega inválida.').safeParse(deliveryId)
  if (!parsed.success) return { ok: false, error: 'Entrega inválida.' }

  const auth = await authorize('orders.read')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: raw, error } = await supabase
      .from('digital_deliveries')
      .select('id, order_id, manual_content, digital_stock_items(content, content_type)')
      .eq('id', parsed.data)
      .maybeSingle()

    if (error || !raw) return { ok: false, error: 'Entrega não encontrada.' }
    const row = raw as unknown as DeliveryRevealRow

    const content = row.manual_content ?? row.digital_stock_items?.content ?? null

    if (!content) {
      // Conteúdo de estoque exige inventory.read no RLS: quem só tem
      // orders.read enxerga a entrega, mas não a chave.
      return {
        ok: false,
        error: 'Sem permissão para ver o conteúdo desta entrega (exige acesso ao estoque).',
      }
    }

    await logAction(
      auth.user.id,
      'delivery.reveal',
      row.order_id,
      'Conteúdo digital revelado no painel.',
      { delivery_id: row.id }
    )

    return {
      ok: true,
      content,
      contentType: row.digital_stock_items?.content_type ?? 'text',
    }
  } catch (error) {
    console.error('[revealDeliveryAction]', error)
    return { ok: false, error: 'Não foi possível revelar o conteúdo agora.' }
  }
}
