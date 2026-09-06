import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, Package, PackageOpen } from 'lucide-react'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireUser } from '@/lib/auth'
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT } from '@/lib/queries/delivery'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus, PaymentStatus } from '@/lib/types/database.types'
import { formatDateTime, formatPrice } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Meus pedidos',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface OrderRow {
  id: string
  order_number: number
  status: OrderStatus
  payment_status: PaymentStatus
  total_cents: number
  created_at: string
  order_items: { id: string; product_name: string; product_image_url: string | null }[]
}

/**
 * Lista de pedidos do cliente.
 *
 * Aqui o client com sessão basta: a policy `orders_select_own` filtra por
 * user_id = auth.uid(), então não existe filtro para repor à mão — e é
 * justamente por isso que esta tela NÃO usa o service_role.
 */
export default async function MeusPedidosPage() {
  const user = await requireUser('/conta/pedidos')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, payment_status, total_cents, created_at, order_items(id, product_name, product_image_url)'
    )
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<OrderRow[]>()

  if (error) {
    console.error('[MeusPedidosPage]', { code: error.code, message: error.message })
  }

  const orders = data ?? []

  return (
    <div className="container-store py-6 sm:py-8">
      <Breadcrumbs
        items={[{ label: 'Minha conta', href: '/conta' }, { label: 'Meus pedidos' }]}
        className="mb-4"
      />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Meus pedidos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compras feitas com a conta <span className="text-foreground">{user.email}</span>.
        </p>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title="Você ainda não tem pedidos"
          description="Quando comprar, o pedido aparece aqui com o status e o conteúdo entregue. Compras feitas sem login ficam apenas no link enviado por e-mail."
          action={
            <Button asChild>
              <Link href="/produtos">Ver produtos</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const items = order.order_items ?? []
            const preview = items.slice(0, 3)
            const rest = items.length - preview.length

            return (
              <li key={order.id}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="p-0">
                    <Link
                      href={`/conta/pedidos/${order.id}`}
                      className="flex flex-col gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            Pedido #{order.order_number}
                          </span>
                          <Badge variant={ORDER_STATUS_VARIANT[order.status]}>
                            {ORDER_STATUS_LABEL[order.status]}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(order.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          {preview.map((item) =>
                            item.product_image_url ? (
                              <Image
                                key={item.id}
                                src={item.product_image_url}
                                alt={item.product_name}
                                width={40}
                                height={40}
                                className="size-10 rounded-md border border-border bg-card object-cover"
                              />
                            ) : (
                              <span
                                key={item.id}
                                className="flex size-10 items-center justify-center rounded-md border border-border bg-muted"
                              >
                                <Package className="size-4 text-muted-foreground" aria-hidden />
                              </span>
                            )
                          )}
                          {rest > 0 && (
                            <span className="flex size-10 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground">
                              +{rest}
                            </span>
                          )}
                        </div>

                        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                          {items.map((item) => item.product_name).join(', ') || 'Pedido'}
                        </p>

                        <span className="shrink-0 text-base font-bold tabular-nums text-foreground">
                          {formatPrice(order.total_cents)}
                        </span>

                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
