import type { ComponentProps } from 'react'
import Link from 'next/link'
import {
  Package,
  PackagePlus,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { RevenueChart, type RevenuePoint } from '@/components/admin/revenue-chart'
import { StatCard } from '@/components/admin/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, timeAgo } from '@/lib/utils'
import type { OrderStatus } from '@/lib/types/database.types'

export const metadata = { title: 'Dashboard' }

const TIMEZONE = 'America/Sao_Paulo'
const DAY_MS = 86_400_000
const RANGE_DAYS = 30

/** en-CA formata como YYYY-MM-DD, que é a chave de agrupamento por dia. */
const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dayLabel = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: '2-digit',
})

type BadgeVariant = ComponentProps<typeof Badge>['variant']

const ORDER_STATUS: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pendente', variant: 'warning' },
  paid: { label: 'Pago', variant: 'success' },
  processing: { label: 'Processando', variant: 'default' },
  completed: { label: 'Concluído', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  refunded: { label: 'Reembolsado', variant: 'muted' },
}

interface PaidOrderRow {
  total_cents: number | null
  paid_at: string | null
  created_at: string
}

interface RecentOrderRow {
  id: string
  order_number: number
  customer_name: string | null
  customer_email: string
  status: OrderStatus
  total_cents: number
  created_at: string
}

interface TopProductRow {
  id: string
  name: string
  sales_count: number
  price_cents: number
}

/** Sem base de comparação a variação não existe — "+100%" sobre zero é ruído. */
function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

interface RevenueSummary {
  series: RevenuePoint[]
  revenueTotal: number
  revenueCurrent: number
  revenuePrevious: number
  paidCurrent: number
  paidPrevious: number
}

/**
 * Série diária dos últimos 30 dias + os 30 dias anteriores para comparar.
 *
 * Os dias são agrupados no fuso de São Paulo: uma venda das 22h de sábado tem
 * de cair no sábado do lojista, não no domingo UTC.
 */
function summarizeRevenue(paidOrders: PaidOrderRow[]): RevenueSummary {
  const now = Date.now()
  const series: RevenuePoint[] = []
  const indexByDay = new Map<string, number>()

  for (let i = RANGE_DAYS - 1; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS)
    const key = dayKey.format(date)
    indexByDay.set(key, series.length)
    series.push({ day: key, label: dayLabel.format(date), cents: 0 })
  }

  const cutCurrent = now - RANGE_DAYS * DAY_MS
  const cutPrevious = now - 2 * RANGE_DAYS * DAY_MS

  let revenueTotal = 0
  let revenueCurrent = 0
  let revenuePrevious = 0
  let paidCurrent = 0
  let paidPrevious = 0

  for (const order of paidOrders) {
    const cents = order.total_cents ?? 0
    revenueTotal += cents

    const moment = new Date(order.paid_at ?? order.created_at).getTime()
    if (!Number.isFinite(moment)) continue

    if (moment >= cutCurrent) {
      revenueCurrent += cents
      paidCurrent += 1
      const position = indexByDay.get(dayKey.format(new Date(moment)))
      if (position !== undefined) series[position].cents += cents
    } else if (moment >= cutPrevious) {
      revenuePrevious += cents
      paidPrevious += 1
    }
  }

  return { series, revenueTotal, revenueCurrent, revenuePrevious, paidCurrent, paidPrevious }
}

export default async function AdminDashboardPage() {
  const user = await getSessionUser()
  const supabase = await createClient()

  const canOrders = can(user, 'orders.read')
  const canProducts = can(user, 'products.read')
  const canCustomers = can(user, 'customers.read')
  const canCreateProduct = can(user, 'products.write')

  const [paidRes, ordersCountRes, activeProductsRes, productsCountRes, customersRes, topProductsRes, recentOrdersRes] =
    await Promise.all([
      // Uma leitura só alimenta receita total, série de 30 dias e comparação
      // com o período anterior. O RLS já limita o que este admin pode ver.
      canOrders
        ? supabase
            .from('orders')
            .select('total_cents, paid_at, created_at')
            .eq('payment_status', 'paid')
            .order('created_at', { ascending: false })
            .limit(5000)
        : null,
      canOrders ? supabase.from('orders').select('id', { count: 'exact', head: true }) : null,
      canProducts
        ? supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active')
        : null,
      canProducts ? supabase.from('products').select('id', { count: 'exact', head: true }) : null,
      canCustomers ? supabase.from('profiles').select('id', { count: 'exact', head: true }) : null,
      canProducts
        ? supabase
            .from('products')
            .select('id, name, sales_count, price_cents')
            .gt('sales_count', 0)
            .order('sales_count', { ascending: false })
            .limit(5)
        : null,
      canOrders
        ? supabase
            .from('orders')
            .select('id, order_number, customer_name, customer_email, status, total_cents, created_at')
            .order('created_at', { ascending: false })
            .limit(8)
        : null,
    ])

  const paidOrders = (paidRes?.data ?? []) as PaidOrderRow[]
  const recentOrders = (recentOrdersRes?.data ?? []) as RecentOrderRow[]
  const topProducts = (topProductsRes?.data ?? []) as TopProductRow[]

  const ordersCount = ordersCountRes?.count ?? 0
  const activeProducts = activeProductsRes?.count ?? 0
  const totalProducts = productsCountRes?.count ?? 0
  const customersCount = customersRes?.count ?? 0

  const { series, revenueTotal, revenueCurrent, revenuePrevious, paidCurrent, paidPrevious } =
    summarizeRevenue(paidOrders)

  const hasRevenue = series.some((point) => point.cents > 0)
  const isNewStore = canProducts && totalProducts === 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral da loja: receita, pedidos e o que está vendendo."
      >
        {canCreateProduct && (
          <Button asChild size="sm">
            <Link href="/admin/produtos/novo">
              <PackagePlus />
              Novo produto
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="space-y-4 sm:space-y-5">
        {isNewStore && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackagePlus className="size-5 text-primary" />
                Sua loja ainda não tem produtos
              </CardTitle>
              <CardDescription>
                Cadastre o primeiro produto para a vitrine sair do ar vazia. Assim que existirem
                vendas, os números e o gráfico desta tela passam a fazer sentido.
              </CardDescription>
            </CardHeader>
            {canCreateProduct && (
              <CardFooter>
                <Button asChild>
                  <Link href="/admin/produtos/novo">Cadastrar primeiro produto</Link>
                </Button>
              </CardFooter>
            )}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {canOrders && (
            <StatCard
              label="Receita total"
              value={formatPrice(revenueTotal)}
              icon={<Wallet />}
              change={percentChange(revenueCurrent, revenuePrevious)}
              changeLabel="nos últimos 30 dias"
              hint="Somando apenas pedidos pagos"
            />
          )}
          {canOrders && (
            <StatCard
              label="Pedidos"
              value={ordersCount.toLocaleString('pt-BR')}
              icon={<ShoppingCart />}
              change={percentChange(paidCurrent, paidPrevious)}
              changeLabel="pagos nos últimos 30 dias"
              hint="Total de pedidos criados"
            />
          )}
          {canProducts && (
            <StatCard
              label="Produtos ativos"
              value={activeProducts.toLocaleString('pt-BR')}
              icon={<Package />}
              hint={`${totalProducts.toLocaleString('pt-BR')} cadastrados no total`}
            />
          )}
          {canCustomers && (
            <StatCard
              label="Clientes"
              value={customersCount.toLocaleString('pt-BR')}
              icon={<Users />}
              hint="Contas criadas na loja"
            />
          )}
        </div>

        {canOrders && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">Receita dos últimos 30 dias</CardTitle>
                <CardDescription>Somando os pedidos com pagamento confirmado.</CardDescription>
              </div>
              <span className="hidden shrink-0 text-right sm:block">
                <span className="block text-lg font-semibold">{formatPrice(revenueCurrent)}</span>
                <span className="block text-xs text-muted-foreground">no período</span>
              </span>
            </CardHeader>
            <CardContent>
              {hasRevenue ? (
                <RevenueChart data={series} />
              ) : (
                <EmptyState
                  icon={<TrendingUp />}
                  title="Nenhuma venda confirmada nos últimos 30 dias"
                  description="O gráfico aparece assim que o primeiro pagamento for aprovado."
                />
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {canOrders && (
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">Pedidos recentes</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/pedidos">Ver todos</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {recentOrders.length === 0 ? (
                  <EmptyState
                    icon={<ShoppingCart />}
                    title="Nenhum pedido ainda"
                    description="Os pedidos aparecem aqui assim que o primeiro cliente finalizar a compra."
                  />
                ) : (
                  <ul className="-mx-2 divide-y divide-border">
                    {recentOrders.map((order) => {
                      const status = ORDER_STATUS[order.status] ?? {
                        label: order.status,
                        variant: 'muted' as BadgeVariant,
                      }
                      return (
                        <li key={order.id}>
                          <Link
                            href={`/admin/pedidos/${order.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                #{order.order_number} · {order.customer_name || order.customer_email}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {timeAgo(order.created_at)}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                              <span className="text-sm font-semibold">
                                {formatPrice(order.total_cents)}
                              </span>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {canProducts && (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">Mais vendidos</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/produtos">Ver todos</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <EmptyState
                    icon={<Package />}
                    title="Sem vendas registradas"
                    description="A lista mostra os cinco produtos com mais vendas."
                  />
                ) : (
                  <ol className="-mx-2 divide-y divide-border">
                    {topProducts.map((product, index) => (
                      <li key={product.id}>
                        <Link
                          href={`/admin/produtos/${product.id}`}
                          className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent"
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{product.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {product.sales_count.toLocaleString('pt-BR')}{' '}
                              {product.sales_count === 1 ? 'venda' : 'vendas'}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold">
                            {formatPrice(product.price_cents)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
