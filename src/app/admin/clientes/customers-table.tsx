'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatPrice, initials } from '@/lib/utils'

export interface AdminCustomerRow {
  id: string
  email: string
  full_name: string | null
  created_at: string
  order_count: number
  paid_cents: number
}

export function CustomersTable({ rows }: { rows: AdminCustomerRow[] }) {
  const columns = React.useMemo<DataTableColumn<AdminCustomerRow>[]>(
    () => [
      {
        key: 'full_name',
        header: 'Cliente',
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {initials(row.full_name ?? row.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.full_name ?? 'Sem nome'}</p>
              <p className="truncate text-xs text-muted-foreground">{row.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'order_count',
        header: 'Pedidos',
        render: (row) =>
          row.order_count > 0 ? (
            <span className="tabular-nums">{row.order_count}</span>
          ) : (
            <Badge variant="muted">Nenhum</Badge>
          ),
      },
      {
        key: 'paid_cents',
        header: 'Total gasto',
        className: 'font-semibold tabular-nums',
        render: (row) => formatPrice(row.paid_cents),
      },
      {
        key: 'created_at',
        header: 'Cadastro',
        className: 'whitespace-nowrap text-muted-foreground',
        render: (row) => formatDate(row.created_at),
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      getRowHref={(row) => `/admin/clientes/${row.id}`}
      emptyMessage="Nenhum cliente encontrado."
    />
  )
}
