'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatPrice } from '@/lib/utils'

import type { BadgeVariant } from '../pedidos/order-status'

export interface AdminCouponRow {
  id: string
  code: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  usage_count: number
  usage_limit: number | null
  starts_at: string | null
  expires_at: string | null
  /** Já calculado no servidor — ver couponStatus() em coupon-utils.ts. */
  status_label: string
  status_variant: BadgeVariant
}

function discountLabel(row: AdminCouponRow): string {
  // value é percentual quando type = 'percentage' e REAIS quando 'fixed'.
  return row.type === 'percentage'
    ? `${row.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
    : formatPrice(Math.round(row.value * 100))
}

export function CouponsTable({ rows }: { rows: AdminCouponRow[] }) {
  const columns = React.useMemo<DataTableColumn<AdminCouponRow>[]>(
    () => [
      {
        key: 'code',
        header: 'Código',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-mono font-semibold uppercase">{row.code}</p>
            {row.description && (
              <p className="truncate text-xs text-muted-foreground">{row.description}</p>
            )}
          </div>
        ),
      },
      {
        key: 'value',
        header: 'Desconto',
        className: 'font-semibold tabular-nums',
        render: discountLabel,
      },
      {
        key: 'usage',
        header: 'Usos',
        render: (row) => (
          <span className="tabular-nums">
            {row.usage_count}
            <span className="text-muted-foreground">
              {row.usage_limit === null ? ' / ∞' : ` / ${row.usage_limit}`}
            </span>
          </span>
        ),
      },
      {
        key: 'window',
        header: 'Validade',
        className: 'whitespace-nowrap text-muted-foreground text-xs',
        render: (row) => {
          if (!row.starts_at && !row.expires_at) return 'Sem prazo'
          const start = row.starts_at ? formatDate(row.starts_at) : 'agora'
          const end = row.expires_at ? formatDate(row.expires_at) : 'sem fim'
          return `${start} → ${end}`
        },
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <Badge variant={row.status_variant}>{row.status_label}</Badge>,
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      getRowHref={(row) => `/admin/cupons/${row.id}`}
      emptyMessage="Nenhum cupom cadastrado."
    />
  )
}
