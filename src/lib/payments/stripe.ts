import 'server-only'
import Stripe from 'stripe'

/**
 * Integração com a Stripe.
 *
 * DECISÃO: Pix via PaymentIntent, com o QR renderizado na própria loja —
 * não Stripe Checkout (redirect).
 *
 * Motivo: o comprador brasileiro de produto digital abre o app do banco, lê o
 * QR e volta. Mandá-lo para um domínio externo no meio disso custa conversão,
 * e a Stripe entrega o QR cru em `next_action.pix_display_qr_code`, que encaixa
 * direto no componente <PixPayment /> que a loja já tem.
 *
 * Contrapartida assumida: cartão exigiria Payment Element (ou Checkout) além
 * disto. Como o site inteiro foi desenhado em cima de Pix, isso fica para
 * quando houver demanda — ver README, seção do gateway.
 *
 * PRÉ-REQUISITOS na conta Stripe:
 *   1. Conta brasileira (Pix só existe para entidades no Brasil).
 *   2. Pix habilitado em Dashboard > Settings > Payment methods.
 *   3. Webhook apontando para /api/webhooks/stripe com os eventos
 *      payment_intent.succeeded, payment_intent.payment_failed e
 *      payment_intent.canceled.
 */

let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (cached) return cached

  const key = process.env.STRIPE_SECRET_KEY

  if (!key || key.startsWith('COLE_AQUI')) {
    throw new Error(
      'STRIPE_SECRET_KEY não configurada. ' +
        'Pegue em dashboard.stripe.com/apikeys e coloque no .env.local.'
    )
  }

  cached = new Stripe(key, {
    // Repetir a mesma requisição de rede não deve gerar duas cobranças.
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'roblox-store' },
  })

  return cached
}

/** Quanto tempo o QR fica válido. A Stripe aceita de 30s a 1 dia. */
const PIX_EXPIRES_SECONDS = 30 * 60

export interface PixCharge {
  paymentIntentId: string
  /** URL da imagem do QR (a Stripe hospeda). */
  qrCodeImageUrl: string | null
  /** Código copia e cola. */
  qrCodeText: string | null
  expiresAt: string | null
  status: Stripe.PaymentIntent.Status
}

/**
 * Cria a cobrança Pix de um pedido.
 *
 * O valor vem do pedido já gravado no banco — nunca do cliente. `amount` é em
 * centavos, que é exatamente como a loja guarda e como a Stripe espera para BRL.
 *
 * A chave de idempotência amarra a cobrança ao pedido: se a ação for chamada
 * duas vezes (duplo clique, retry de rede), a Stripe devolve o MESMO
 * PaymentIntent em vez de criar outra cobrança.
 */
export async function createPixCharge(input: {
  orderId: string
  orderNumber: number
  amountCents: number
  customerEmail: string
  customerName?: string | null
  /**
   * Diferencia a chave de idempotência quando o cliente pede um código novo
   * porque o anterior expirou. Sem isso, a Stripe devolveria exatamente o
   * PaymentIntent morto que se está tentando substituir.
   */
  idempotencySuffix?: string
}): Promise<PixCharge> {
  const stripe = getStripe()

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: 'brl',
      payment_method_types: ['pix'],
      payment_method_data: { type: 'pix' },
      payment_method_options: {
        pix: { expires_after_seconds: PIX_EXPIRES_SECONDS },
      },
      // confirm:true já devolve o QR na resposta, sem uma segunda chamada.
      confirm: true,
      receipt_email: input.customerEmail,
      description: `Pedido #${input.orderNumber}`,
      // O webhook confia NESTE campo para achar o pedido — o corpo do evento
      // é o único dado que veio assinado pela Stripe.
      metadata: {
        order_id: input.orderId,
        order_number: String(input.orderNumber),
      },
    },
    {
      idempotencyKey: input.idempotencySuffix
        ? `pedido-${input.orderId}-${input.idempotencySuffix}`
        : `pedido-${input.orderId}`,
    }
  )

  const pix = intent.next_action?.pix_display_qr_code ?? null

  return {
    paymentIntentId: intent.id,
    qrCodeImageUrl: pix?.image_url_png ?? null,
    qrCodeText: pix?.data ?? null,
    expiresAt: pix?.expires_at ? new Date(pix.expires_at * 1000).toISOString() : null,
    status: intent.status,
  }
}

/**
 * Traduz falha da Stripe para algo que o cliente entenda.
 *
 * Mensagem crua de gateway na tela ("No such payment_method_configuration")
 * não ajuda ninguém e ainda entrega detalhe de configuração da conta.
 */
export function translateStripeError(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    // Erro de configuração da conta: quem precisa saber é o dono da loja,
    // então vai para o log do servidor com o texto original.
    console.error('[stripe]', error.type, error.code, error.message)

    switch (error.type) {
      case 'StripeCardError':
        return 'O pagamento foi recusado. Tente outro método.'
      case 'StripeRateLimitError':
        return 'Muitas tentativas em sequência. Aguarde alguns segundos.'
      case 'StripeConnectionError':
      case 'StripeAPIError':
        return 'O sistema de pagamento está instável no momento. Tente de novo.'
      case 'StripeInvalidRequestError':
        // Pix não habilitado na conta cai aqui. É erro do lojista, não do
        // comprador — por isso a mensagem não pede para ele tentar de novo.
        return 'O pagamento via Pix não está disponível agora. Fale com o suporte da loja.'
      case 'StripeAuthenticationError':
        return 'O pagamento está indisponível no momento. Fale com o suporte da loja.'
      default:
        return 'Não foi possível gerar o pagamento. Tente novamente.'
    }
  }

  console.error('[stripe:desconhecido]', error)
  return 'Não foi possível gerar o pagamento. Tente novamente.'
}

/**
 * Valida a assinatura do webhook e devolve o evento.
 *
 * Sem esta verificação, qualquer um que descubra a URL manda um POST dizendo
 * "pagou" e leva o produto de graça. É a peça de segurança mais importante da
 * integração inteira.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret || secret.startsWith('COLE_AQUI')) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada.')
  }
  if (!signature) {
    throw new Error('Requisição sem cabeçalho stripe-signature.')
  }

  // `Stripe.webhooks` estático, NÃO getStripe().
  //
  // Verificar a assinatura é só um HMAC sobre o corpo com o webhook secret —
  // não toca na API. Passar por getStripe() exigiria a STRIPE_SECRET_KEY e
  // acoplaria duas coisas independentes: se a chave da API sumisse ou fosse
  // rotacionada, o webhook passaria a recusar eventos legítimos e a loja
  // pararia de entregar pedidos pagos, sem erro que explicasse a causa.
  //
  // constructEvent também rejeita timestamp velho, cobrindo replay.
  return Stripe.webhooks.constructEvent(rawBody, signature, secret)
}
