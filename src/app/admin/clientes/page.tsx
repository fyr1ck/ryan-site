import type { Metadata } from 'next'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { AdminPagination } from '../admin-pagination'
import { PermissionNotice } from '../permission-notice'
import { SearchForm } from '../search-form'
import { CustomersTable, type AdminCustomerRow } from './customers-table'

export const metadata: Metadata = { title: 'Clientes' }

const PER_PAGE = 25

interface PageProps {
  searchParams: Promise<{ q?: string; pagina?: string }>
}

function sanitizeTerm(value: string): string {
  return value.replace(/[,()%\\*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function parsePage(value: string | undefined): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export default async function AdminCustomersPage({ searchParams }: PageProps) {
  const { q: qParam, pagina } = await searchParams

  const user = await getSessionUser()
  if (!can(user, 'customers.read')) {
    return (
      <>
        <PageHeader title="Clientes" />
        <PermissionNotice permission="customers.read" what="os clientes" />
      </>
    )
  }

  const term = sanitizeTerm(qParam ?? '')
  const page = parsePage(pagina)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select('id, email, full_name, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (term !== '') {
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
  }

  const { data, count, error } = await query
  if (error) console.error('[AdminCustomersPage]', error)

  const profiles = (data ?? []) as {
    id: string
    email: string
    full_name: string | null
    created_at: string
  }[]

  // ---------------------------------------------------------------------------
  // Agregação por E-MAIL, não por user_id.
  //
  // `orders.customer_email` é snapshot do comprador e existe em todo pedido,
  // inclusive nos feitos como convidado antes de a pessoa criar conta. Agregar
  // por user_id mostraria "0 pedidos" para quem comprou primeiro e se cadastrou
  // depois — exatamente o cliente que o lojista mais quer enxergar.
  // ---------------------------------------------------------------------------
  const emails = profiles.map((profile) => profile.email)
  const stats = new Map<string, { orders: number; paid: number }>()

  if (emails.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_email, total_cents, payment_status')
      .in('customer_email', emails)

    for (const order of orders ?? []) {
      const key = String(order.customer_email).toLowerCase()
      const entry = stats.get(key) ?? { orders: 0, paid: 0 }
      entry.orders += 1
      // Só pagamento confirmado entra no "total gasto": pedido pendente é
      // intenção, não dinheiro.
      if (order.payment_status === 'paid') entry.paid += (order.total_cents as number) ?? 0
      stats.set(key, entry)
    }
  }

  const rows: AdminCustomerRow[] = profiles.map((profile) => {
    const entry = stats.get(profile.email.toLowerCase())
    return {
      ...profile,
      order_count: entry?.orders ?? 0,
      paid_cents: entry?.paid ?? 0,
    }
  })

  const total = count ?? rows.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Todo mundo que já criou conta na loja. O total gasto conta apenas pedidos com pagamento confirmado."
      />

      <SearchForm
        key={term}
        basePath="/admin/clientes"
        q={term}
        placeholder="Buscar por nome ou e-mail"
      />

      <CustomersTable rows={rows} />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/clientes"
        params={{ q: term || undefined }}
        itemLabel="clientes"
      />
    </>
  )
}
