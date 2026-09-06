'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  /** Chave da propriedade em `row` quando não houver `render`. */
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  emptyMessage?: string
  /** Quando existir, a linha inteira leva para esta rota. */
  getRowHref?: (row: T) => string
  getRowKey?: (row: T, index: number) => React.Key
  className?: string
}

function cellValue<T>(row: T, column: DataTableColumn<T>): React.ReactNode {
  if (column.render) return column.render(row)

  const raw = (row as unknown as Record<string, unknown>)[column.key]
  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-muted-foreground">—</span>
  }
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não'
  return String(raw)
}

/**
 * Tabela genérica do painel.
 *
 * IMPORTANTE: `render` e `getRowHref` são funções, e função não atravessa o
 * limite servidor → cliente. Monte as colunas dentro de um Client Component.
 *
 * No mobile vira lista de cards: rolagem horizontal em tabela de 6 colunas é
 * o jeito mais rápido de esconder informação de quem usa o painel no celular.
 */
export function DataTable<T>({
  columns,
  rows,
  emptyMessage = 'Nada por aqui ainda.',
  getRowHref,
  getRowKey,
  className,
}: DataTableProps<T>) {
  const router = useRouter()

  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} className={className} />
  }

  const keyFor = (row: T, index: number): React.Key => getRowKey?.(row, index) ?? index
  const [firstColumn, ...restColumns] = columns

  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, href: string) {
    // O clique num link/botão dentro da célula manda nele mesmo — sem isto a
    // linha navegaria por cima da ação que o usuário realmente pediu.
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea, [role="menuitem"]')) return
    router.push(href)
  }

  return (
    <div className={className}>
      {/* ---------- Desktop ---------- */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const href = getRowHref?.(row)
              return (
                <TableRow
                  key={keyFor(row, index)}
                  className={cn(href && 'cursor-pointer')}
                  onClick={href ? (event) => handleRowClick(event, href) : undefined}
                >
                  {columns.map((column, columnIndex) => {
                    const content = cellValue(row, column)
                    return (
                      <TableCell key={column.key} className={column.className}>
                        {/* A primeira célula é um link de verdade: teclado e
                            leitor de tela não dependem do onClick da linha. */}
                        {href && columnIndex === 0 ? (
                          <Link
                            href={href}
                            className="font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ---------- Mobile ---------- */}
      <div className="grid gap-2 md:hidden">
        {rows.map((row, index) => {
          const href = getRowHref?.(row)
          const title = firstColumn ? cellValue(row, firstColumn) : null

          return (
            <div
              key={keyFor(row, index)}
              className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              {firstColumn && (
                <div className="text-sm font-semibold">
                  {href ? (
                    <Link
                      href={href}
                      className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </div>
              )}

              {restColumns.length > 0 && (
                <dl className="mt-2 grid gap-1.5">
                  {restColumns.map((column) => (
                    <div
                      key={column.key}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 text-right">{cellValue(row, column)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
