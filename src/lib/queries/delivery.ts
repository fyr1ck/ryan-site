import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentStatus,
} from '@/lib/types/database.types'

// =============================================================================
// Leitura de pedido para a TELA DO COMPRADOR (confirmação + entrega digital).
//
// Aqui se usa o createAdminClient() de propósito: o pedido de convidado não tem
// user_id, então nenhuma policy de RLS consegue liberá-lo para a sessão anônima.
// O preço disso é que o RLS some por completo — e, sem ele, `select * from
// orders where id = ?` devolveria o pedido de QUALQUER pessoa que descubra um
// uuid.
//
// Por isso o filtro de propriedade é REPOSTO À MÃO, em getOrderForViewer():
// ou o pedido é do usuário logado, ou o e-mail informado bate com
// orders.customer_email. Não batendo, a função devolve null e a página mostra
// "pedido não encontrado" — nunca um dado do pedido alheio.
//
// A mesma regra vale dentro do banco: get_my_delivery() é SECURITY DEFINER e
// repõe o mesmo filtro antes de entregar qualquer código.
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// -----------------------------------------------------------------------------
// Rótulos de status.
//
// Ficam aqui, e não no componente client de entrega, porque as três telas que
// os usam (/pedido/[id], /conta/pedidos e /conta/pedidos/[id]) são Server
// Components — e valor exportado de arquivo 'use client' chega no servidor como
// referência, não como função chamável.
// -----------------------------------------------------------------------------
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  processing: 'Em separação',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

export type StatusVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'muted'

export const ORDER_STATUS_VARIANT: Record<OrderStatus, StatusVariant> = {
  pending: 'warning',
  paid: 'success',
  processing: 'default',
  completed: 'success',
  cancelled: 'muted',
  refunded: 'muted',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Aguardando pagamento',
  authorized: 'Autorizado',
  paid: 'Pago',
  failed: 'Não aprovado',
  expired: 'Expirado',
  refunded: 'Reembolsado',
  chargeback: 'Contestado',
}

/** Um id fora do formato nem chega ao banco: `uuid` inválido derruba a query. */
export function isUuid(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Como a propriedade do pedido foi comprovada — decide o argumento da RPC. */
export type OrderAccess = 'user' | 'email'

export interface OrderViewer {
  /** Sessão logada, quando houver. */
  userId?: string | null
  /** E-mail informado (?email= do convidado ou o e-mail da conta). */
  email?: string | null
}

export interface OrderView {
  order: Order
  items: OrderItem[]
  /** Cobrança mais recente do pedido — é dela que sai o QR do Pix. */
  payment: Payment | null
  access: OrderAccess
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * Pedido + itens + pagamento, apenas para quem prova ser o dono.
 * Devolve null tanto para "não existe" quanto para "não é seu": as duas
 * respostas precisam ser indistinguíveis por fora.
 */
export async function getOrderForViewer(
  orderId: string,
  viewer: OrderViewer
): Promise<OrderView | null> {
  if (!isUuid(orderId)) return null

  const viewerEmail = normalizeEmail(viewer.email)
  const viewerId = viewer.userId ?? null

  // Sem nenhuma forma de identificação não há o que conferir.
  if (!viewerId && !viewerEmail) return null

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error('[getOrderForViewer:admin-client]', error)
    return null
  }

  const { data: order, error } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle<Order>()

  if (error) {
    console.error('[getOrderForViewer:order]', { code: error.code, message: error.message })
    return null
  }
  if (!order) return null

  // ---------------------------------------------------------------------
  // O filtro que o RLS faria, refeito na mão.
  // ---------------------------------------------------------------------
  const orderEmail = normalizeEmail(order.customer_email)

  let access: OrderAccess | null = null
  if (viewerId && order.user_id === viewerId) {
    access = 'user'
  } else if (viewerEmail && orderEmail && orderEmail === viewerEmail) {
    // Cobre o convidado com ?email= e também quem comprou deslogado e depois
    // criou conta com o mesmo e-mail.
    access = 'email'
  }

  if (!access) return null

  const [{ data: items }, { data: payments }] = await Promise.all([
    admin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    admin
      .from('payments')
      .select(
        'id, order_id, provider, provider_payment_id, method, status, amount_cents, qr_code, qr_code_text, expires_at, paid_at, created_at, updated_at'
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  return {
    order,
    items: (items ?? []) as OrderItem[],
    payment: ((payments ?? []) as Payment[])[0] ?? null,
    access,
  }
}

// -----------------------------------------------------------------------------
// ENTREGA DIGITAL
// -----------------------------------------------------------------------------

export interface DeliveryContent {
  type: string
  content: string
}

export interface DeliveryItem {
  order_item_id: string
  product_name: string
  quantity: number
  delivery_type: string
  contents: DeliveryContent[]
}

export interface DeliveryResult {
  paid: boolean
  items: DeliveryItem[]
  /** Mensagem para a tela quando a RPC recusa ou cai. */
  error: string | null
}

const EMPTY_DELIVERY: DeliveryResult = { paid: false, items: [], error: null }

function normalizeContents(value: unknown): DeliveryContent[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const record = raw as Record<string, unknown>
    const content = record.content
    if (typeof content !== 'string' || content === '') return []
    return [{ type: typeof record.type === 'string' ? record.type : 'text', content }]
  })
}

function normalizeDelivery(data: unknown): DeliveryResult | null {
  if (!data || typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  const paid = record.paid === true
  const rawItems = Array.isArray(record.items) ? record.items : []

  const items = rawItems.flatMap((raw): DeliveryItem[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.order_item_id !== 'string') return []

    return [
      {
        order_item_id: item.order_item_id,
        product_name: typeof item.product_name === 'string' ? item.product_name : 'Produto',
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        delivery_type: typeof item.delivery_type === 'string' ? item.delivery_type : 'manual',
        contents: normalizeContents(item.contents),
      },
    ]
  })

  return { paid, items, error: null }
}

/**
 * Conteúdo entregue do pedido.
 *
 * A RPC é `revoke`ada de anon e authenticated na migration — só a service_role
 * chega nela. Daí o createAdminClient(). Ela é SECURITY DEFINER e refaz por
 * dentro a mesma checagem de propriedade feita aqui em cima, então mandar o
 * argumento certo importa: `p_user_id` só quando o pedido é mesmo do usuário
 * logado (senão a própria RPC levanta 42501), `p_email` no caso do convidado.
 */
export async function getDeliveryForOrder(
  orderId: string,
  viewer: { userId?: string | null; email?: string | null }
): Promise<DeliveryResult> {
  if (!isUuid(orderId)) return EMPTY_DELIVERY

  const userId = viewer.userId ?? null
  const email = normalizeEmail(viewer.email)
  if (!userId && !email) return EMPTY_DELIVERY

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('get_my_delivery', {
      p_order_id: orderId,
      p_user_id: userId,
      p_email: userId ? null : email,
    })

    if (error) {
      // 42501 = a RPC recusou o acesso. Quem chega aqui já passou pelo filtro
      // de propriedade, então isso é divergência entre as duas checagens —
      // registra e mostra texto neutro.
      console.error('[getDeliveryForOrder:rpc]', { code: error.code, message: error.message })
      return {
        paid: false,
        items: [],
        error: 'Não foi possível carregar a entrega agora. Atualize a página em instantes.',
      }
    }

    const delivery = normalizeDelivery(data)
    if (!delivery) {
      console.error('[getDeliveryForOrder:resposta-inesperada]', data)
      return { paid: false, items: [], error: 'Não foi possível carregar a entrega agora.' }
    }

    return delivery
  } catch (error) {
    console.error('[getDeliveryForOrder]', error)
    return { paid: false, items: [], error: 'Não foi possível carregar a entrega agora.' }
  }
}
