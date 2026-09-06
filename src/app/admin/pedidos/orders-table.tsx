'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatPrice } from '@/lib/utils'
import type { OrderStatus, PaymentStatus } from '@/lib/types/database.types'

import { orderStatusMeta, paymentStatusMeta } from './order-status'

export interface AdminOrderRow {
  id: string
  order_number: number
  customer_name: string | null
  customer_email: string
  status: OrderStatus
  payment_status: PaymentStatus
  total_cents: number
  created_at: string
  item_count: number
}

/**
 * Tabela de pedidos.
 *
 * Existe como Client Component por uma razão só: as colunas do DataTable levam
 * funções `render`, e função não atravessa a fronteira servidor → cliente.
 */
export function OrdersTable({ rows }: { rows: AdminOrderRow[] }) {
  const columns = React.useMemo<DataTableColumn<AdminOrderRow>[]>(
    () => [
      {
        key: 'order_number',
        header: 'Pedido',
        render: (row) => <span className="tabular-nums">#{row.order_number}</span>,
      },
      {
        key: 'customer',
        header: 'Cliente',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.customer_name ?? 'Sem nome'}</p>
            <p className="truncate text-xs text-muted-foreground">{row.customer_email}</p>
          </div>
        ),
      },
      {
        key: 'item_count',
        header: 'Itens',
        render: (row) => <span className="tabular-nums">{row.item_count}</span>,
      },
      {
        key: 'total_cents',
        header: 'Total',
        className: 'font-semibold tabular-nums',
        render: (row) => formatPrice(row.total_cents),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const meta = orderStatusMeta(row.status)
          return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
      },
      {
        key: 'payment_status',
        header: 'Pagamento',
        render: (row) => {
          const meta = paymentStatusMeta(row.payment_status)
          return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
      },
      {
        key: 'created_at',
        header: 'Data',
        className: 'whitespace-nowrap text-muted-foreground',
        render: (row) => formatDateTime(row.created_at),
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      getRowHref={(row) => `/admin/pedidos/${row.id}`}
      emptyMessage="Nenhum pedido encontrado com esses filtros."
    />
  )
}
