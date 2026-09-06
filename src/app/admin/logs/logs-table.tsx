'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

export interface AdminLogRow {
  id: string
  created_at: string
  actor_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
}

/** Entidades que este painel registra, traduzidas para a coluna. */
const ENTITY_LABEL: Record<string, string> = {
  order: 'Pedido',
  review: 'Avaliação',
  coupon: 'Cupom',
  digital_stock: 'Estoque',
  admin_access: 'Acesso',
  product: 'Produto',
  category: 'Categoria',
  collection: 'Coleção',
  banner: 'Banner',
  page: 'Página',
  setting: 'Configuração',
}

export function LogsTable({ rows }: { rows: AdminLogRow[] }) {
  const columns = React.useMemo<DataTableColumn<AdminLogRow>[]>(
    () => [
      {
        key: 'created_at',
        header: 'Data',
        className: 'whitespace-nowrap',
        render: (row) => <span className="tabular-nums">{formatDateTime(row.created_at)}</span>,
      },
      {
        key: 'actor_email',
        header: 'Admin',
        render: (row) =>
          row.actor_email ?? <span className="text-muted-foreground">sistema</span>,
      },
      {
        key: 'action',
        header: 'Ação',
        // A chave da ação NÃO é traduzida de propósito: é o identificador pelo
        // qual se busca no banco durante uma investigação. O texto em português
        // fica no resumo, ao lado.
        render: (row) => <code className="font-mono text-xs">{row.action}</code>,
      },
      {
        key: 'entity_type',
        header: 'Entidade',
        render: (row) =>
          row.entity_type ? (
            <div className="min-w-0">
              <Badge variant="secondary">
                {ENTITY_LABEL[row.entity_type] ?? row.entity_type}
              </Badge>
              {row.entity_id && (
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {row.entity_id}
                </p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: 'summary',
        header: 'Resumo',
        className: 'max-w-sm',
        render: (row) =>
          row.summary ? (
            <span className="text-sm">{row.summary}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      emptyMessage="Nenhum registro no período selecionado."
    />
  )
}
