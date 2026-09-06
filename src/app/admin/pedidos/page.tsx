import type { Metadata } from 'next'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/types/database.types'

import { AdminPagination } from '../admin-pagination'
import { PermissionNotice } from '../permission-notice'
import { OrderFilters } from './order-filters'
import { ORDER_STATUS } from './order-status'
import { OrdersTable, type AdminOrderRow } from './orders-table'

export const metadata: Metadata = { title: 'Pedidos' }

const PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string; pagina?: string }>
}

/**
 * Busca digitada pelo admin.
 *
 * Vírgula e parêntese são a sintaxe do `.or()` do PostgREST — deixar passar
 * transformaria uma busca por "silva, joão" em filtro malformado. Aqui eles
 * viram espaço antes de qualquer coisa.
 */
function sanitizeTerm(value: string): string {
  return value.replace(/[,()%\\*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function parsePage(value: string | undefined): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status: statusParam, q: qParam, pagina } = await searchParams

  const user = await getSessionUser()
  if (!can(user, 'orders.read')) {
    return (
      <>
        <PageHeader title="Pedidos" />
        <PermissionNotice permission="orders.read" what="os pedidos" />
      </>
    )
  }

  const status =
    statusParam && statusParam in ORDER_STATUS ? (statusParam as OrderStatus) : undefined
  const term = sanitizeTerm(qParam ?? '')
  const page = parsePage(pagina)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_email, status, payment_status, total_cents, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (status) query = query.eq('status', status)

  if (term !== '') {
    // Só dígitos = o admin colou o número do pedido. Buscar "1042" dentro do
    // e-mail de todo mundo devolveria lixo; igualdade no número devolve o alvo.
    if (/^\d+$/.test(term)) {
      query = query.eq('order_number', Number(term))
    } else {
      query = query.or(`customer_email.ilike.%${term}%,customer_name.ilike.%${term}%`)
    }
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[AdminOrdersPage]', error)
  }

  const orders = (data ?? []) as Omit<AdminOrderRow, 'item_count'>[]

  // Contagem de itens numa consulta só. Não usa agregação embutida do PostgREST
  // de propósito: contar em JS aqui é barato (20 pedidos por página) e não
  // depende da versão do PostgREST que estiver rodando.
  const ids = orders.map((order) => order.id)
  const counts = new Map<string, number>()

  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, quantity')
      .in('order_id', ids)

    for (const item of items ?? []) {
      const key = item.order_id as string
      counts.set(key, (counts.get(key) ?? 0) + ((item.quantity as number) ?? 0))
    }
  }

  const rows: AdminOrderRow[] = orders.map((order) => ({
    ...order,
    item_count: counts.get(order.id) ?? 0,
  }))

  const total = count ?? rows.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Acompanhe pagamentos, entregas e cancelamentos. Clique num pedido para abrir a operação completa."
      />

      {/* key = filtros da URL: o campo de busca se realinha por remontagem
          quando o admin navega no histórico. */}
      <OrderFilters key={`${status ?? ''}|${term}`} status={status} q={term} />

      <OrdersTable rows={rows} />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/pedidos"
        params={{ status, q: term || undefined }}
        itemLabel="pedidos"
      />
    </>
  )
}
