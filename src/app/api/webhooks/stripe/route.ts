import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { verifyWebhookSignature } from '@/lib/payments/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Webhook da Stripe.
 *
 * É o ÚNICO caminho pelo qual um pedido vira "pago". A página do cliente nunca
 * decide isso: ela só mostra o que está no banco. Assim, fechar o navegador no
 * meio do Pix não impede a entrega, e um POST forjado não a provoca.
 *
 * Configurar em dashboard.stripe.com/webhooks apontando para
 *   https://SEU-DOMINIO/api/webhooks/stripe
 * com os eventos: payment_intent.succeeded, payment_intent.payment_failed,
 * payment_intent.canceled.
 */

// O SDK da Stripe usa crypto do Node para validar a assinatura.
export const runtime = 'nodejs'
// Webhook nunca pode ser servido de cache.
export const dynamic = 'force-dynamic'

/** Eventos que este endpoint trata. O resto é ignorado com 200. */
const TRATADOS = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
])

export async function POST(request: Request) {
  // 1) Corpo CRU. Qualquer parse antes disto invalida a assinatura, porque o
  //    hash é calculado sobre os bytes exatos que a Stripe enviou.
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(rawBody, signature)
  } catch (error) {
    // Assinatura inválida, ausente ou vencida: não passa daqui.
    console.error('[stripe-webhook] assinatura recusada', error)
    return NextResponse.json({ error: 'assinatura invalida' }, { status: 400 })
  }

  if (!TRATADOS.has(event.type)) {
    // 200 de propósito: devolver erro faria a Stripe reenviar para sempre um
    // evento que a loja simplesmente não usa.
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const intent = event.data.object as Stripe.PaymentIntent
  const orderId = intent.metadata?.order_id

  if (!orderId) {
    console.error('[stripe-webhook] PaymentIntent sem order_id no metadata', intent.id)
    return NextResponse.json({ received: true, warning: 'sem order_id' })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    // 500 aqui é o certo: a Stripe reenvia, e o pedido não fica perdido.
    console.error('[stripe-webhook] service_role ausente', error)
    return NextResponse.json({ error: 'indisponivel' }, { status: 500 })
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      // Confere o valor recebido contra o que o pedido cobra. Divergência
      // significa cobrança adulterada — não entrega, e registra para análise.
      const { data: order } = await admin
        .from('orders')
        .select('total_cents')
        .eq('id', orderId)
        .maybeSingle()

      if (order && intent.amount_received > 0 && intent.amount_received < order.total_cents) {
        console.error(
          '[stripe-webhook] valor menor que o pedido',
          { orderId, pago: intent.amount_received, devido: order.total_cents }
        )
        await admin
          .from('payments')
          .update({ status: 'failed', raw_payload: intent as unknown as Record<string, unknown> })
          .eq('provider_payment_id', intent.id)

        return NextResponse.json({ received: true, warning: 'valor divergente' })
      }

      await admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          raw_payload: intent as unknown as Record<string, unknown>,
        })
        .eq('provider_payment_id', intent.id)

      // A RPC baixa estoque, entrega o digital e conclui o pedido.
      // É idempotente: a Stripe reenvia o mesmo evento em caso de timeout, e
      // a segunda chamada não entrega nada de novo.
      const { error } = await admin.rpc('mark_order_paid', { p_order_id: orderId })

      if (error) {
        console.error('[stripe-webhook] mark_order_paid falhou', orderId, error)
        // 500 para a Stripe tentar de novo — o cliente pagou e precisa receber.
        return NextResponse.json({ error: 'falha ao processar' }, { status: 500 })
      }

      return NextResponse.json({ received: true, order_id: orderId })
    }

    // Falhou ou foi cancelado: devolve o estoque reservado ao pool.
    const status = event.type === 'payment_intent.canceled' ? 'failed' : 'failed'

    await admin
      .from('payments')
      .update({ status, raw_payload: intent as unknown as Record<string, unknown> })
      .eq('provider_payment_id', intent.id)

    const { error } = await admin.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason:
        event.type === 'payment_intent.canceled'
          ? 'Pagamento cancelado'
          : 'Pagamento recusado pelo gateway',
    })

    if (error) console.error('[stripe-webhook] cancel_order falhou', orderId, error)

    return NextResponse.json({ received: true, order_id: orderId })
  } catch (error) {
    console.error('[stripe-webhook] erro inesperado', event.type, error)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}

/** GET existe só para conferir se a rota está no ar; não revela nada. */
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'stripe-webhook' })
}
