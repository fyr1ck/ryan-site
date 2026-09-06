import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, CircleSlash, Clock, Package, PackageOpen, SearchX } from 'lucide-react'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { DeliveryList, OrderStatusPoller, PixPayment } from '@/components/store/order-delivery'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Separator } from '@/components/ui/separator'
import { requireUser } from '@/lib/auth'
import {
  getDeliveryForOrder,
  getOrderForViewer,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABEL,
} from '@/lib/queries/delivery'
import { formatDateTime, formatPrice } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Detalhe do pedido',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Detalhe do pedido dentro da conta.
 *
 * Passa pelo mesmo getOrderForViewer() da tela pública: além do pedido ligado
 * ao user_id, ele libera o pedido feito como convidado com o MESMO e-mail da
 * conta — que o RLS sozinho não alcançaria, porque naquela linha user_id é
 * null. O filtro de propriedade continua explícito lá dentro.
 */
export default async function PedidoDaContaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser('/conta/pedidos')

  const view = await getOrderForViewer(id, { userId: user.id, email: user.email })

  if (!view) {
    return (
      <div className="container-store py-10 sm:py-16">
        <EmptyState
          icon={<SearchX />}
          title="Pedido não encontrado"
          description="Este pedido não existe ou não pertence à sua conta."
          action={
            <Button asChild>
              <Link href="/conta/pedidos">Voltar aos meus pedidos</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { order, items, payment, access } = view

  const isPaid = order.payment_status === 'paid'
  const isClosed = order.status === 'cancelled' || order.status === 'refunded'
  const isAwaitingPayment = !isPaid && !isClosed

  const delivery = isPaid
    ? await getDeliveryForOrder(order.id, {
        userId: access === 'user' ? user.id : null,
        email: access === 'email' ? user.email : null,
      })
    : null

  return (
    <div className="container-store py-6 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Minha conta', href: '/conta' },
          { label: 'Meus pedidos', href: '/conta/pedidos' },
          { label: `#${order.order_number}` },
        ]}
        className="mb-4"
      />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isPaid ? (
              <CheckCircle2 className="size-6 text-success" aria-hidden />
            ) : isClosed ? (
              <CircleSlash className="size-6 text-muted-foreground" aria-hidden />
            ) : (
              <Clock className="size-6 text-warning" aria-hidden />
            )}
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Pedido #{order.order_number}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Feito em {formatDateTime(order.created_at)} · Pagamento:{' '}
            {PAYMENT_STATUS_LABEL[order.payment_status]}
          </p>
        </div>

        <Badge variant={ORDER_STATUS_VARIANT[order.status]} className="px-3 py-1 text-sm">
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          {isAwaitingPayment && (
            <div className="space-y-3">
              <PixPayment
                qrCode={payment?.qr_code ?? null}
                qrCodeText={payment?.qr_code_text ?? null}
                amountCents={payment?.amount_cents ?? order.total_cents}
                expiresAt={payment?.expires_at ?? null}
                orderId={order.id}
              />
              <OrderStatusPoller active />
            </div>
          )}

          {isPaid && delivery && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <PackageOpen className="size-5 text-success" aria-hidden />
                <h2 className="text-lg font-semibold text-foreground">Seu conteúdo</h2>
              </div>

              {delivery.error ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  {delivery.error}
                </p>
              ) : delivery.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
                  Pagamento confirmado. Estamos preparando a entrega — ela aparece aqui assim que
                  estiver pronta.
                </p>
              ) : (
                <DeliveryList items={delivery.items} />
              )}
            </section>
          )}

          {isClosed && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="text-sm font-semibold text-foreground">
                  {order.status === 'cancelled' ? 'Pedido cancelado' : 'Pedido reembolsado'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.status === 'cancelled'
                    ? 'Este pedido foi cancelado e não pode mais ser pago.'
                    : 'O valor deste pedido foi devolvido. O prazo de crédito depende do seu banco.'}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Itens do pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    {item.product_image_url ? (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        width={56}
                        height={56}
                        className="size-14 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                        <Package className="size-5 text-muted-foreground" aria-hidden />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {item.product_slug ? (
                        <Link
                          href={`/produto/${item.product_slug}`}
                          className="line-clamp-2 text-sm font-medium text-foreground hover:text-primary"
                        >
                          {item.product_name}
                        </Link>
                      ) : (
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {item.product_name}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.quantity} × {formatPrice(item.unit_price_cents)}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatPrice(item.total_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {formatPrice(order.subtotal_cents)}
                </dd>
              </div>
              {order.discount_cents > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    Descontos
                    {order.coupon_code && (
                      <span className="ml-1 text-xs text-success">({order.coupon_code})</span>
                    )}
                  </dt>
                  <dd className="font-medium tabular-nums text-success">
                    - {formatPrice(order.discount_cents)}
                  </dd>
                </div>
              )}
            </dl>

            <Separator />

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-xl font-bold tabular-nums text-foreground">
                {formatPrice(order.total_cents)}
              </span>
            </div>

            <Button asChild variant="outline" className="w-full">
              <Link href="/conta/pedidos">Voltar aos meus pedidos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
