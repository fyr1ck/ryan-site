import 'server-only'

/**
 * Integração com a MisticPay (gateway de Pix).
 *
 * POR QUE NÃO STRIPE: Pix na Stripe para empresas brasileiras é invite-only e
 * exige 60 dias processando pagamentos na plataforma. Como esta loja só vende
 * por Pix, o requisito é impossível de cumprir — não havia como começar.
 *
 * ------------------------------------------------------------------------
 * DUAS ARMADILHAS DESTA API, tratadas aqui e em nenhum outro lugar:
 *
 * 1. UNIDADE ASSIMÉTRICA. A criação recebe o valor em REAIS (4.55 = R$ 4,55),
 *    mas a resposta e o webhook devolvem em CENTAVOS (455). Misturar os dois
 *    cobra 100x a mais ou a menos. A loja inteira trabalha em centavos, então a
 *    conversão para reais acontece só na borda da requisição, abaixo.
 *
 * 2. WEBHOOK SEM ASSINATURA. A MisticPay não assina o corpo do webhook. Sem
 *    assinatura, qualquer um que descubra a URL manda um POST dizendo "pagou" e
 *    leva o produto de graça. Por isso o corpo do webhook é tratado como um
 *    SINAL, não como prova: quem confirma o pagamento é checkTransaction(),
 *    que pergunta à API com as nossas credenciais. Ver a rota do webhook.
 * ------------------------------------------------------------------------
 */

const API_BASE = 'https://api.misticpay.com/api'

/** Quanto tempo o QR fica válido. A API aceita de 30 minutos a 30 dias. */
const PIX_EXPIRES_SECONDS = 30 * 60

/**
 * Basic auth com as Access Keys (pk_/sk_).
 *
 * As credenciais legadas (ci_/cs_, em headers próprios) são descontinuadas em
 * 30/09/2026 e não permitem saque — não vale nascer preso a elas.
 */
function authHeader(): string {
  const publicKey = process.env.MISTICPAY_PUBLIC_KEY
  const secretKey = process.env.MISTICPAY_SECRET_KEY

  if (!publicKey || !secretKey || publicKey.startsWith('COLE_AQUI')) {
    throw new GatewayError(
      'MISTICPAY_PUBLIC_KEY / MISTICPAY_SECRET_KEY não configuradas. ' +
        'Pegue no painel da MisticPay e coloque no .env.local.',
      'config'
    )
  }

  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`
}

/** Erro com origem identificada, para a tradução saber o que dizer ao cliente. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'rede' | 'recusado' | 'resposta',
    readonly detail?: unknown
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Sem cache nunca: é chamada de dinheiro.
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    if (error instanceof GatewayError) throw error
    throw new GatewayError('Falha de rede ao falar com o gateway.', 'rede', error)
  }

  const texto = await response.text()
  let json: Record<string, unknown>
  try {
    json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
  } catch {
    throw new GatewayError('Resposta do gateway não é JSON.', 'resposta', texto.slice(0, 500))
  }

  if (!response.ok) {
    // Mensagem crua do gateway vai para o log, nunca para a tela.
    console.error('[misticpay]', path, response.status, texto.slice(0, 500))
    throw new GatewayError(
      typeof json.message === 'string' ? json.message : `HTTP ${response.status}`,
      'recusado',
      json
    )
  }

  return json
}

/** Centavos (como a loja guarda) -> reais (como a criação da cobrança espera). */
function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2))
}

export interface PixCharge {
  /** ID da transação NA MISTICPAY. É por ele que o webhook acha o pedido. */
  paymentIntentId: string
  /** Imagem do QR — vem como data URI base64. */
  qrCodeImageUrl: string | null
  /** Copia e cola. */
  qrCodeText: string | null
  expiresAt: string | null
  status: string
}

/**
 * Cria a cobrança Pix de um pedido.
 *
 * O valor vem do pedido já gravado no banco — nunca do cliente.
 *
 * `transactionId` é a NOSSA referência (o id do pedido). O gateway devolve a
 * dele em `data.transactionId`, e é essa que guardamos em
 * payments.provider_payment_id, porque é a que chega no webhook.
 */
export async function createPixCharge(input: {
  orderId: string
  orderNumber: number
  amountCents: number
  customerName: string
  /** CPF só com dígitos. Obrigatório pela API do gateway. */
  customerDocument: string
  /** Diferencia a referência quando o cliente pede um código novo. */
  idempotencySuffix?: string
}): Promise<PixCharge> {
  const referencia = input.idempotencySuffix
    ? `pedido-${input.orderId}-${input.idempotencySuffix}`
    : `pedido-${input.orderId}`

  const json = await post('/transactions/create', {
    amount: centsToReais(input.amountCents),
    payerName: input.customerName,
    payerDocument: input.customerDocument,
    transactionId: referencia,
    description: `Pedido #${input.orderNumber}`,
    projectWebhook: webhookUrl(),
  })

  const data = (json.data ?? {}) as Record<string, unknown>
  const id = data.transactionId

  if (id === undefined || id === null || String(id).trim() === '') {
    console.error('[misticpay] resposta sem transactionId', json)
    throw new GatewayError('Gateway não devolveu o id da transação.', 'resposta', json)
  }

  const qrBase64 = typeof data.qrCodeBase64 === 'string' ? data.qrCodeBase64 : null
  const copyPaste = typeof data.copyPaste === 'string' ? data.copyPaste : null

  if (!qrBase64 && !copyPaste) {
    console.error('[misticpay] resposta sem QR nem copia-e-cola', json)
    throw new GatewayError('Gateway não devolveu o código Pix.', 'resposta', json)
  }

  return {
    paymentIntentId: String(id),
    qrCodeImageUrl: qrBase64,
    qrCodeText: copyPaste,
    expiresAt: new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString(),
    status: typeof data.transactionState === 'string' ? data.transactionState : 'PENDENTE',
  }
}

export interface TransactionStatus {
  /** Estado autoritativo: PENDENTE | COMPLETO | FALHA. */
  state: string
  /** Valor EM CENTAVOS, como a API devolve. */
  amountCents: number | null
  raw: Record<string, unknown>
}

/**
 * Pergunta ao gateway qual é, de fato, o estado da transação.
 *
 * Esta função é a substituta da verificação de assinatura do webhook. O corpo
 * que chega no webhook não prova nada — qualquer um pode forjá-lo. A resposta
 * daqui prova, porque sai da API autenticada com a nossa chave secreta.
 */
export async function checkTransaction(transactionId: string): Promise<TransactionStatus> {
  const json = await post('/transactions/check', { transactionId })

  // A API às vezes aninha em `data`, às vezes devolve na raiz. Aceitar os dois
  // evita que uma mudança de formato pare a confirmação de pagamento.
  const data = (
    json.data && typeof json.data === 'object' ? json.data : json
  ) as Record<string, unknown>

  const state = data.transactionState ?? data.status
  const amount = data.transactionAmount ?? data.value

  return {
    state: typeof state === 'string' ? state.toUpperCase() : '',
    amountCents: typeof amount === 'number' ? Math.round(amount) : null,
    raw: data,
  }
}

/**
 * URL que o gateway chama quando o Pix cai.
 *
 * O token no caminho é defesa em profundidade: não substitui a verificação em
 * checkTransaction(), mas faz um POST de quem só adivinhou o domínio morrer no
 * 404 antes de custar uma chamada à API.
 */
function webhookUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  const token = process.env.MISTICPAY_WEBHOOK_TOKEN

  if (!base || !token || token.startsWith('COLE_AQUI')) return undefined

  // localhost não é alcançável pelo gateway. Mandar assim mesmo faria a
  // MisticPay tentar e desistir em silêncio — melhor não prometer webhook.
  if (/localhost|127\.0\.0\.1/.test(base)) return undefined

  return `${base}/api/webhooks/misticpay/${token}`
}

/** Traduz falha do gateway para algo que o cliente entenda. */
export function translateGatewayError(error: unknown): string {
  if (error instanceof GatewayError) {
    switch (error.kind) {
      case 'config':
        // Erro do lojista, não do comprador — por isso não pede "tente de novo".
        console.error('[misticpay:config]', error.message)
        return 'O pagamento está indisponível no momento. Fale com o suporte da loja.'
      case 'rede':
        return 'O sistema de pagamento não respondeu. Tente novamente em instantes.'
      case 'recusado':
        return 'Não foi possível gerar o Pix. Confira seus dados e tente de novo.'
      case 'resposta':
        return 'O sistema de pagamento respondeu de forma inesperada. Tente novamente.'
    }
  }

  console.error('[misticpay:desconhecido]', error)
  return 'Não foi possível gerar o pagamento. Tente novamente.'
}
