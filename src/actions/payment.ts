'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionUser } from '@/lib/auth'
import { createPixCharge, translateStripeError } from '@/lib/payments/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Gera um código Pix novo para um pedido que ainda não foi pago.
 *
 * O código da Stripe expira em 30 minutos. Sem isto, um cliente que demorou
 * para pagar ficaria com um pedido de pé e um QR morto, sem saída na tela — e o
 * estoque continuaria reservado até alguém cancelar à mão.
 */

const schema = z.object({
  order_id: z.uuid('Pedido inválido.'),
  /** Prova de posse do convidado; quem está logado usa a sessão. */
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined),
    z.email('E-mail inválido.').optional()
  ),
})

export type RegenerarPixResult = { ok: true } | { ok: false; error: string }

/** Teto de códigos por pedido: evita virar gerador infinito de cobrança. */
const MAX_TENTATIVAS = 5

export async function regeneratePixChargeAction(input: unknown): Promise<RegenerarPixResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { order_id, email } = parsed.data

  const user = await getSessionUser()

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error('[regeneratePixCharge:admin-client]', error)
    return { ok: false, error: 'Pagamento indisponível no momento. Tente novamente.' }
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, order_number, user_id, customer_email, total_cents, status, payment_status')
    .eq('id', order_id)
    .maybeSingle()

  if (orderError || !order) {
    return { ok: false, error: 'Pedido não encontrado.' }
  }

  // Filtro de posse reposto à mão: o client admin ignora o RLS, então quem
  // decide se esta pessoa pode mexer no pedido é este bloco.
  const donoPelaSessao = user && order.user_id === user.id
  const donoPeloEmail = email && order.customer_email.toLowerCase() === email
  if (!donoPelaSessao && !donoPeloEmail) {
    return { ok: false, error: 'Pedido não encontrado.' }
  }

  if (order.payment_status === 'paid') {
    return { ok: false, error: 'Este pedido já foi pago.' }
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return { ok: false, error: 'Este pedido foi cancelado.' }
  }

  const { count } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order_id)

  const tentativas = count ?? 0
  if (tentativas >= MAX_TENTATIVAS) {
    return {
      ok: false,
      error: 'Muitas tentativas de pagamento para este pedido. Fale com o suporte da loja.',
    }
  }

  let charge
  try {
    charge = await createPixCharge({
      orderId: order.id,
      orderNumber: order.order_number,
      amountCents: order.total_cents,
      customerEmail: order.customer_email,
      // A chave de idempotência precisa MUDAR a cada tentativa. Repetir a do
      // pedido devolveria o mesmo PaymentIntent — justamente o que expirou.
      idempotencySuffix: String(tentativas + 1),
    })
  } catch (error) {
    return { ok: false, error: translateStripeError(error) }
  }

  // As cobranças antigas viram 'expired': o histórico do pedido continua
  // contando o que aconteceu, e só a última fica pendente.
  await admin
    .from('payments')
    .update({ status: 'expired' })
    .eq('order_id', order_id)
    .eq('status', 'pending')

  const { error: insertError } = await admin.from('payments').insert({
    order_id: order.id,
    provider: 'stripe',
    provider_payment_id: charge.paymentIntentId,
    method: 'pix',
    status: 'pending',
    amount_cents: order.total_cents,
    qr_code: charge.qrCodeImageUrl,
    qr_code_text: charge.qrCodeText,
    expires_at: charge.expiresAt,
  })

  if (insertError) {
    console.error('[regeneratePixCharge:insert]', insertError, charge.paymentIntentId)
    return { ok: false, error: 'Não foi possível registrar o novo código. Tente novamente.' }
  }

  revalidatePath(`/pedido/${order_id}`)
  revalidatePath(`/conta/pedidos/${order_id}`)

  return { ok: true }
}
