'use client'

import Link from 'next/link'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { Layers, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteCollection } from '@/actions/collections'

export interface CollectionRow {
  id: string
  name: string
  slug: string
  image_url: string | null
  is_active: boolean
  show_on_home: boolean
  product_count: number
}

export interface CollectionsTableProps {
  rows: CollectionRow[]
  canDelete: boolean
}

export function CollectionsTable({ rows, canDelete }: CollectionsTableProps) {
  const router = useRouter()

  async function handleDelete(row: CollectionRow) {
    const result = await deleteCollection({ id: row.id })
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir a coleção.')
    toast.success('Coleção excluída.')
    router.refresh()
  }

  const columns: DataTableColumn<CollectionRow>[] = [
    {
      key: 'name',
      header: 'Coleção',
      render: (row) => (
        <span className="flex items-center gap-3">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            {row.image_url ? (
              <NextImage
                src={row.image_url}
                alt=""
                fill
                sizes="40px"
                unoptimized={row.image_url.endsWith('.svg')}
                className="object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-muted-foreground">
                <Layers className="size-4" />
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.name}</span>
            <span className="block truncate text-xs text-muted-foreground">/{row.slug}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'product_count',
      header: 'Produtos',
      className: 'text-right tabular-nums',
      render: (row) => row.product_count.toLocaleString('pt-BR'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={row.is_active ? 'success' : 'muted'}>
            {row.is_active ? 'Ativa' : 'Inativa'}
          </Badge>
          {row.show_on_home && <Badge variant="secondary">Home</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon-sm" title="Editar">
            <Link href={`/admin/colecoes/${row.id}`} aria-label={`Editar ${row.name}`}>
              <Pencil />
            </Link>
          </Button>

          {canDelete && (
            <ConfirmDelete
              onConfirm={() => handleDelete(row)}
              title={`Excluir "${row.name}"?`}
              description="Os produtos continuam no catálogo — só o agrupamento desaparece."
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Excluir"
                  aria-label={`Excluir ${row.name}`}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              }
            />
          )}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      getRowHref={(row) => `/admin/colecoes/${row.id}`}
      emptyMessage="Nenhuma coleção criada ainda."
    />
  )
}
