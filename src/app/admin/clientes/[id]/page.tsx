import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone, ShoppingCart, Star, Wallet } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { StatCard } from '@/components/admin/stat-card'
import { RatingStars } from '@/components/store/rating-stars'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, OrderStatus, PaymentStatus } from '@/lib/types/database.types'
import { formatDate, formatDateTime, formatPrice, initials } from '@/lib/utils'

import { PermissionNotice } from '../../permission-notice'
import { orderStatusMeta, paymentStatusMeta } from '../../pedidos/order-status'

interface PageProps {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ProfileRow {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  created_at: string
}

interface OrderRow {
  id: string
  order_number: number
  status: OrderStatus
  payment_status: PaymentStatus
  total_cents: number
  created_at: string
}

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  is_approved: boolean
  created_at: string
  products: { name: string; slug: string } | null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return { title: 'Cliente' }

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', id)
    .maybeSingle()

  return { title: data ? (data.full_name ?? data.email) : 'Cliente' }
}

export default async function AdminCustomerDetailPage({ params }: PageProps) {
  const { id } = await params

  const user = await getSessionUser()
  if (!can(user, 'customers.read')) {
    return (
      <>
        <PageHeader title="Cliente" />
        <PermissionNotice permission="customers.read" what="a ficha do cliente" />
      </>
    )
  }

  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!profileRaw) notFound()
  const profile = profileRaw as unknown as ProfileRow

  const [{ data: ordersRaw }, { data: reviewsRaw }, { data: rolesRaw }] = await Promise.all([
    // Por e-mail, e não por user_id: pega também o que a pessoa comprou como
    // convidada antes de criar a conta.
    supabase
      .from('orders')
      .select('id, order_number, status, payment_status, total_cents, created_at')
      .eq('customer_email', profile.email)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('reviews')
      .select('id, rating, comment, is_approved, created_at, products(name, slug)')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('user_roles').select('role').eq('user_id', id),
  ])

  const orders = (ordersRaw ?? []) as unknown as OrderRow[]
  const reviews = (reviewsRaw ?? []) as unknown as ReviewRow[]
  const roles = ((rolesRaw ?? []) as { role: AppRole }[]).map((row) => row.role)

  const paidOrders = orders.filter((order) => order.payment_status === 'paid')
  const spentCents = paidOrders.reduce((sum, order) => sum + order.total_cents, 0)
  const averageCents = paidOrders.length > 0 ? Math.round(spentCents / paidOrders.length) : 0

  const displayName = profile.full_name ?? profile.email

  return (
    <>
      <Link
        href="/admin/clientes"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Todos os clientes
      </Link>

      <PageHeader title={displayName} description={`Cliente desde ${formatDate(profile.created_at)}`}>
        {roles.includes('super_admin') && <Badge variant="default">Super admin</Badge>}
        {roles.includes('admin') && <Badge variant="secondary">Administrador</Badge>}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total gasto"
          value={formatPrice(spentCents)}
          icon={<Wallet />}
          hint={`${paidOrders.length} pedido(s) pago(s)`}
        />
        <StatCard
          label="Pedidos"
          value={orders.length}
          icon={<ShoppingCart />}
          hint="inclui compras como convidado"
        />
        <StatCard
          label="Ticket médio"
          value={formatPrice(averageCents)}
          icon={<Star />}
          hint="sobre pedidos pagos"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-primary" />
                Pedidos ({orders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este cliente ainda não fez nenhum pedido.
                </p>
              )}

              {orders.map((order) => {
                const status = orderStatusMeta(order.status)
                const payment = paymentStatusMeta(order.payment_status)
                return (
                  <Link
                    key={order.id}
                    href={`/admin/pedidos/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">#{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant={payment.variant}>{payment.label}</Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatPrice(order.total_cents)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="size-4 text-primary" />
                Avaliações escritas ({reviews.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este cliente ainda não avaliou nenhum produto.
                </p>
              )}

              {reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {review.products?.name ?? 'Produto removido'}
                    </p>
                    <div className="flex items-center gap-2">
                      <RatingStars rating={review.rating} />
                      <Badge variant={review.is_approved ? 'success' : 'warning'}>
                        {review.is_approved ? 'Publicada' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {review.comment}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDateTime(review.created_at)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados do cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {initials(displayName)}
                </span>
                <p className="min-w-0 truncate font-medium">{displayName}</p>
              </div>

              <p className="flex items-start gap-2 break-all text-muted-foreground">
                <Mail className="mt-0.5 size-4 shrink-0" />
                {profile.email}
              </p>

              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0" />
                {profile.phone ?? 'Sem telefone'}
              </p>

              <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Cadastro</dt>
                  <dd>{formatDateTime(profile.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ID interno</dt>
                  <dd className="break-all font-mono">{profile.id}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {orders.length === 0 && reviews.length === 0 && (
            <EmptyState
              title="Conta sem atividade"
              description="Criou conta mas ainda não comprou nem avaliou nada."
            />
          )}
        </div>
      </div>
    </>
  )
}
