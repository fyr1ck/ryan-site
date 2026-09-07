import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { checkTransaction } from '@/lib/payments/misticpay'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Webhook da MisticPay.
 *
 * É o ÚNICO caminho pelo qual um pedido vira "pago". A página do cliente nunca
 * decide isso: ela só mostra o que está no banco.
 *
 * =========================================================================
 * O PROBLEMA CENTRAL: ESTE WEBHOOK NÃO É ASSINADO.
 *
 * A Stripe assinava o corpo com HMAC, e verificar essa assinatura era a peça
 * de segurança mais importante da integração. A MisticPay não assina nada.
 * Tratado ingenuamente, isso significa: quem descobrir a URL manda
 *   POST { "transactionId": 123, "status": "COMPLETO" }
 * e leva o produto de graça.
 *
 * DUAS DEFESAS, nesta ordem:
 *
 * 1. TOKEN NA URL (defesa em profundidade). O caminho carrega um segredo que
 *    só nós e o gateway conhecemos. Sozinho não bastaria — vaza em log de
 *    proxy, em histórico, em print de tela — mas mata o POST de quem só
 *    adivinhou o domínio, antes de custar uma chamada à API.
 *
 * 2. CONFIRMAÇÃO NA FONTE (a que realmente vale). O corpo do webhook é usado
 *    APENAS para descobrir QUAL transação olhar. Quem diz se ela foi paga é
 *    checkTransaction(), que pergunta à API da MisticPay autenticado com a
 *    nossa chave secreta. Um POST forjado dispara a consulta, a API responde
 *    PENDENTE, e nada é entregue.
 *
 * Ou seja: o atacante precisaria comprometer a própria MisticPay, e nesse
 * ponto o webhook já não é o elo fraco.
 * =========================================================================
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Estados que a MisticPay usa em transactionState/status. */
const PAGO = 'COMPLETO'
const FALHOU = 'FALHA'

/** Compara sem vazar o tamanho do segredo pelo tempo de resposta. */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const esperado = process.env.MISTICPAY_WEBHOOK_TOKEN

  if (!esperado || esperado.startsWith('COLE_AQUI')) {
    console.error('[misticpay-webhook] MISTICPAY_WEBHOOK_TOKEN nao configurado')
    return NextResponse.json({ error: 'indisponivel' }, { status: 500 })
  }

  // 404, não 401: para quem estiver sondando, esta rota não existe.
  if (!tokenConfere(token, esperado)) {
    return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'corpo invalido' }, { status: 400 })
  }

  // Disputa (MED): não mexe em pedido, mas o lojista precisa saber que existe.
  if (body.event === 'INFRACTION') {
    console.error('[misticpay-webhook] INFRACAO/MED recebida', JSON.stringify(body).slice(0, 1000))
    return NextResponse.json({ received: true, event: 'INFRACTION' })
  }

  const transactionId = body.transactionId
  if (transactionId === undefined || transactionId === null || String(transactionId).trim() === '') {
    return NextResponse.json({ received: true, warning: 'sem transactionId' })
  }
  const txId = String(transactionId)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    // 500 para o gateway reenviar: o pedido não pode ficar perdido.
    console.error('[misticpay-webhook] service_role ausente', error)
    return NextResponse.json({ error: 'indisponivel' }, { status: 500 })
  }

  // -------------------------------------------------------------------------
  // Achar o pedido. A relação transação -> pedido vive no NOSSO banco, gravada
  // quando a cobrança foi criada. Nada do que veio no corpo é usado para isso.
  // -------------------------------------------------------------------------
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select('id, order_id, amount_cents, status')
    .eq('provider', 'misticpay')
    .eq('provider_payment_id', txId)
    .maybeSingle()

  if (paymentError) {
    console.error('[misticpay-webhook] falha ao ler payments', txId, paymentError)
    return NextResponse.json({ error: 'indisponivel' }, { status: 500 })
  }

  if (!payment) {
    // Transação que não é nossa, ou webhook chegando antes de o insert terminar.
    // 200 para não entrar em loop de reenvio eterno por algo que talvez nunca
    // exista; se for corrida, o cliente ainda vê o QR e o gateway reenvia.
    console.error('[misticpay-webhook] transacao sem pagamento correspondente', txId)
    return NextResponse.json({ received: true, warning: 'transacao desconhecida' })
  }

  // -------------------------------------------------------------------------
  // A VERIFICAÇÃO QUE SUBSTITUI A ASSINATURA.
  // Pergunta à MisticPay, autenticado, qual é o estado real da transação.
  // -------------------------------------------------------------------------
  let estado: Awaited<ReturnType<typeof checkTransaction>>
  try {
    estado = await checkTransaction(txId)
  } catch (error) {
    // Não dá para confirmar agora. 500 faz o gateway reenviar — melhor atrasar
    // a entrega do que entregar com base num corpo que ninguém assinou.
    console.error('[misticpay-webhook] checkTransaction falhou', txId, error)
    return NextResponse.json({ error: 'nao foi possivel confirmar' }, { status: 500 })
  }

  if (estado.state !== PAGO) {
    if (estado.state === FALHOU) {
      await admin.from('payments').update({ status: 'failed', raw_payload: estado.raw }).eq('id', payment.id)

      const { error } = await admin.rpc('cancel_order', {
        p_order_id: payment.order_id,
        p_reason: 'Pagamento recusado pelo gateway',
      })
      if (error) console.error('[misticpay-webhook] cancel_order falhou', payment.order_id, error)

      return NextResponse.json({ received: true, state: estado.state })
    }

    // Ainda pendente: o corpo dizia uma coisa, a fonte diz outra. Se o corpo
    // afirmava COMPLETO, isto é exatamente a tentativa de fraude sendo barrada.
    if (String(body.status ?? '').toUpperCase() === PAGO) {
      console.error(
        '[misticpay-webhook] CORPO AFIRMOU PAGO MAS A API DIZ QUE NAO',
        { txId, corpo: body.status, api: estado.state }
      )
    }
    return NextResponse.json({ received: true, state: estado.state })
  }

  // -------------------------------------------------------------------------
  // Confere o valor. A API devolve CENTAVOS (a criação recebe reais — ver
  // lib/payments/misticpay.ts). Pagar menos que o pedido não entrega.
  // -------------------------------------------------------------------------
  if (estado.amountCents !== null && estado.amountCents < payment.amount_cents) {
    console.error('[misticpay-webhook] valor menor que o pedido', {
      txId,
      pago: estado.amountCents,
      devido: payment.amount_cents,
    })
    await admin.from('payments').update({ status: 'failed', raw_payload: estado.raw }).eq('id', payment.id)
    return NextResponse.json({ received: true, warning: 'valor divergente' })
  }

  await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), raw_payload: estado.raw })
    .eq('id', payment.id)

  // Baixa estoque, entrega o digital e conclui o pedido. É idempotente: o
  // gateway reenvia em caso de timeout e a segunda chamada não entrega de novo.
  const { error } = await admin.rpc('mark_order_paid', { p_order_id: payment.order_id })

  if (error) {
    console.error('[misticpay-webhook] mark_order_paid falhou', payment.order_id, error)
    // 500 para o gateway tentar de novo — o cliente pagou e precisa receber.
    return NextResponse.json({ error: 'falha ao processar' }, { status: 500 })
  }

  return NextResponse.json({ received: true, order_id: payment.order_id })
}

/** GET só confirma que a rota está no ar, e só com o token certo. */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const esperado = process.env.MISTICPAY_WEBHOOK_TOKEN

  if (!esperado || !tokenConfere(token, esperado)) {
    return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })
  }
  return NextResponse.json({ status: 'ok', endpoint: 'misticpay-webhook' })
}
