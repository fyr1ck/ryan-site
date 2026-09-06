import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  CreditCard,
  MonitorSmartphone,
  Receipt,
  ShoppingBag,
  StickyNote,
  Ticket,
  User,
} from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type {
  DeliveryType,
  DigitalContentType,
  OrderStatus,
  PaymentStatus,
} from '@/lib/types/database.types'
import { cn, formatDateTime, formatPrice } from '@/lib/utils'

import { PermissionNotice } from '../../permission-notice'
import { maskSecret } from '../../secret-mask'
import { orderStatusMeta, paymentStatusMeta } from '../order-status'
import { DeliveryPanel, type DeliveryItemView } from './delivery-panel'
import { OrderActions, OrderNoteForm } from './order-actions'

interface PageProps {
  params: Promise<{ id: string }>
}

const CONTENT_TYPE_LABEL: Record<DigitalContentType, string> = {
  code: 'Código',
  link: 'Link',
  file: 'Arquivo',
  credential: 'Credencial',
  text: 'Texto',
}

interface OrderRow {
  id: string
  order_number: number
  user_id: string | null
  customer_email: string
  customer_name: string | null
  customer_phone: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  coupon_code: string | null
  customer_note: string | null
  admin_note: string | null
  ip_address: string | null
  user_agent: string | null
  paid_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

interface ItemRow {
  id: string
  product_id: string | null
  product_name: string
  product_slug: string | null
  product_image_url: string | null
  unit_price_cents: number
  quantity: number
  total_cents: number
  products: { delivery_type: DeliveryType } | null
}

interface DeliveryRow {
  id: string
  order_item_id: string
  stock_item_id: string | null
  manual_content: string | null
  delivered_at: string
  view_count: number
  digital_stock_items: { content: string; content_type: DigitalContentType } | null
}

interface PaymentRow {
  id: string
  provider: string
  method: string
  status: PaymentStatus
  amount_cents: number
  expires_at: string | null
  paid_at: string | null
  created_at: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return { title: 'Pedido' }

  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', id)
    .maybeSingle()

  return { title: data ? `Pedido #${data.order_number}` : 'Pedido' }
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = await params

  const user = await getSessionUser()
  if (!can(user, 'orders.read')) {
    return (
      <>
        <PageHeader title="Pedido" />
        <PermissionNotice permission="orders.read" what="este pedido" />
      </>
    )
  }

  // UUID malformado bateria no banco como erro 22P02. Barrar aqui devolve 404,
  // que é o que /admin/pedidos/qualquer-coisa realmente é.
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()

  const { data: orderRaw } = await supabase
    .from('orders')
    .select(
      'id, order_number, user_id, customer_email, customer_name, customer_phone, status, payment_status, subtotal_cents, discount_cents, total_cents, coupon_code, customer_note, admin_note, ip_address, user_agent, paid_at, completed_at, cancelled_at, created_at, updated_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (!orderRaw) notFound()
  const order = orderRaw as unknown as OrderRow

  const [{ data: itemsRaw }, { data: deliveriesRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase
      .from('order_items')
      .select(
        'id, product_id, product_name, product_slug, product_image_url, unit_price_cents, quantity, total_cents, products(delivery_type)'
      )
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('digital_deliveries')
      .select(
        'id, order_item_id, stock_item_id, manual_content, delivered_at, view_count, digital_stock_items(content, content_type)'
      )
      .eq('order_id', id)
      .order('delivered_at', { ascending: true }),
    supabase
      .from('payments')
      .select('id, provider, method, status, amount_cents, expires_at, paid_at, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ])

  const items = (itemsRaw ?? []) as unknown as ItemRow[]
  const deliveries = (deliveriesRaw ?? []) as unknown as DeliveryRow[]
  const payments = (paymentsRaw ?? []) as unknown as PaymentRow[]

  const canWrite = can(user, 'orders.write')
  const statusMeta = orderStatusMeta(order.status)
  const paymentMeta = paymentStatusMeta(order.payment_status)

  // ---------------------------------------------------------------------------
  // Painel de entrega.
  //
  // A MÁSCARA É FEITA AQUI, NO SERVIDOR. O conteúdo real (manual_content ou a
  // chave do estoque) morre nesta função: para o navegador vai só "DEMO-••••-3".
  // Quem quiser o valor aperta "Revelar" e passa por revealDeliveryAction(),
  // que registra a visualização em admin_logs.
  // ---------------------------------------------------------------------------
  const deliveryItems: DeliveryItemView[] = items.map((item) => ({
    orderItemId: item.id,
    productName: item.product_name,
    quantity: item.quantity,
    deliveryType: item.products?.delivery_type ?? 'manual',
    deliveries: deliveries
      .filter((delivery) => delivery.order_item_id === item.id)
      .map((delivery) => {
        const raw = delivery.manual_content ?? delivery.digital_stock_items?.content ?? null
        const contentType = delivery.digital_stock_items?.content_type ?? 'text'
        return {
          id: delivery.id,
          masked: raw ? maskSecret(raw) : 'Conteúdo indisponível',
          contentTypeLabel: CONTENT_TYPE_LABEL[contentType] ?? 'Texto',
          deliveredAt: delivery.delivered_at,
          viewCount: delivery.view_count,
          source: delivery.manual_content ? ('manual' as const) : ('stock' as const),
        }
      }),
  }))

  const history = [
    { label: 'Pedido criado', at: order.created_at },
    { label: 'Pagamento confirmado', at: order.paid_at },
    { label: 'Pedido concluído', at: order.completed_at },
    { label: 'Pedido cancelado', at: order.cancelled_at },
  ]
    .filter((entry): entry is { label: string; at: string } => Boolean(entry.at))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <>
      <Link
        href="/admin/pedidos"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Todos os pedidos
      </Link>

      <PageHeader
        title={`Pedido #${order.order_number}`}
        description={`Criado em ${formatDateTime(order.created_at)}`}
      >
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        <Badge variant={paymentMeta.variant}>Pagamento: {paymentMeta.label}</Badge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------ Coluna principal ------------------ */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                Itens ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {item.product_image_url ? (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <ShoppingBag className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Snapshot do nome: o produto pode ter sido renomeado ou
                        excluído depois da compra, mas o pedido continua certo. */}
                    <p className="truncate text-sm font-semibold">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatPrice(item.unit_price_cents)}
                    </p>
                    {item.product_slug && (
                      <Link
                        href={`/produto/${item.product_slug}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Ver na loja
                      </Link>
                    )}
                  </div>

                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatPrice(item.total_cents)}
                  </p>
                </div>
              ))}

              <Separator />

              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatPrice(order.subtotal_cents)}</dd>
                </div>
                {order.discount_cents > 0 && (
                  <div className="flex justify-between text-success">
                    <dt className="flex items-center gap-1.5">
                      <Ticket className="size-3.5" />
                      Desconto {order.coupon_code ? `(${order.coupon_code})` : ''}
                    </dt>
                    <dd className="tabular-nums">− {formatPrice(order.discount_cents)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatPrice(order.total_cents)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <DeliveryPanel
            items={deliveryItems}
            canWrite={canWrite}
            isPaid={order.payment_status === 'paid'}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="size-4 text-primary" />
                Notas administrativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.customer_note && (
                <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Observação do cliente
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{order.customer_note}</p>
                </div>
              )}

              {order.admin_note ? (
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-sans text-sm leading-relaxed">
                  {order.admin_note}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma nota interna ainda.</p>
              )}

              <OrderNoteForm orderId={order.id} canWrite={canWrite} />
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------ Coluna lateral -------------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-4 text-primary" />
                Ações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* key no status: o select volta ao valor do banco assim que a
                  ação termina, sem efeito de sincronização. */}
              <OrderActions
                key={`${order.status}:${order.payment_status}`}
                orderId={order.id}
                status={order.status}
                paymentStatus={order.payment_status}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4 text-primary" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{order.customer_name ?? 'Sem nome'}</p>
              <p className="break-all text-muted-foreground">{order.customer_email}</p>
              {order.customer_phone && (
                <p className="text-muted-foreground">{order.customer_phone}</p>
              )}

              {order.user_id ? (
                <Link
                  href={`/admin/clientes/${order.user_id}`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1 w-full')}
                >
                  Ver ficha do cliente
                </Link>
              ) : (
                <Badge variant="muted">Compra como convidado</Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {payments.length === 0 && (
                <p className="text-muted-foreground">Nenhuma cobrança registrada.</p>
              )}
              {payments.map((payment) => {
                const meta = paymentStatusMeta(payment.status)
                return (
                  <div key={payment.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium uppercase">{payment.method}</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {payment.provider} · {formatPrice(payment.amount_cents)} ·{' '}
                      {formatDateTime(payment.created_at)}
                    </p>
                    {payment.paid_at && (
                      <p className="text-xs text-success">
                        Pago em {formatDateTime(payment.paid_at)}
                      </p>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Histórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Não existe tabela de histórico de status: esta linha do tempo é
                  montada a partir das datas do próprio pedido. */}
              <ol className="space-y-3">
                {history.map((entry) => (
                  <li key={entry.label} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorSmartphone className="size-4 text-primary" />
                Dados técnicos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">IP de origem</dt>
                  <dd className="break-all font-mono">{order.ip_address ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Navegador</dt>
                  <dd className="break-all font-mono leading-relaxed">
                    {order.user_agent ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Última atualização</dt>
                  <dd>{formatDateTime(order.updated_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ID interno</dt>
                  <dd className="break-all font-mono">{order.id}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
