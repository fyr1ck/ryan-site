'use client'

import * as React from 'react'
import Link from 'next/link'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { Copy, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteProduct, duplicateProduct, toggleProductStatus } from '@/actions/products'
import type { ProductStatus } from '@/lib/types/database.types'
import { cn, formatPrice } from '@/lib/utils'

const FALLBACK_IMAGE = '/placeholders/product-1.svg'

const STATUS_META: Record<
  ProductStatus,
  { label: string; variant: 'success' | 'warning' | 'muted' }
> = {
  active: { label: 'Ativo', variant: 'success' },
  draft: { label: 'Rascunho', variant: 'warning' },
  archived: { label: 'Arquivado', variant: 'muted' },
}

export interface ProductRow {
  id: string
  name: string
  slug: string
  sku: string | null
  price_cents: number
  compare_at_cents: number | null
  status: ProductStatus
  /** Já resolvido no servidor: "Ilimitado", "12 chaves", "3 unidades"… */
  stock_label: string
  /** Zero disponível — pinta o número de vermelho. */
  out_of_stock: boolean
  sales_count: number
  image_url: string | null
}

export interface ProductsTableProps {
  rows: ProductRow[]
  canWrite: boolean
  canDelete: boolean
}

export function ProductsTable({ rows, canWrite, canDelete }: ProductsTableProps) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function handleDuplicate(row: ProductRow) {
    if (busyId) return
    setBusyId(row.id)
    try {
      const result = await duplicateProduct({ id: row.id })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível duplicar o produto.')
        return
      }
      toast.success('Cópia criada como rascunho.')
      if (result.id) router.push(`/admin/produtos/${result.id}`)
      else router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(row: ProductRow) {
    if (busyId) return
    setBusyId(row.id)
    try {
      const result = await toggleProductStatus({ id: row.id })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível mudar o status.')
        return
      }
      toast.success(row.status === 'active' ? 'Produto despublicado.' : 'Produto publicado.')
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(row: ProductRow) {
    const result = await deleteProduct({ id: row.id })
    // O ConfirmDelete mostra o toast de erro e mantém o diálogo aberto quando
    // esta função lança — por isso o erro sobe em vez de virar toast aqui.
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir o produto.')
    toast.success('Produto excluído.')
    router.refresh()
  }

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: 'name',
      header: 'Produto',
      render: (row) => (
        <span className="flex items-center gap-3">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            <NextImage
              src={row.image_url ?? FALLBACK_IMAGE}
              alt=""
              fill
              sizes="40px"
              unoptimized={(row.image_url ?? FALLBACK_IMAGE).endsWith('.svg')}
              className="object-cover"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.sku ?? `/${row.slug}`}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Preço',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{formatPrice(row.price_cents)}</span>
          {row.compare_at_cents && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(row.compare_at_cents)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Estoque',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className={cn('text-sm', row.out_of_stock && 'font-semibold text-destructive')}>
          {row.stock_label}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = STATUS_META[row.status]
        return <Badge variant={meta.variant}>{meta.label}</Badge>
      },
    },
    {
      key: 'sales_count',
      header: 'Vendas',
      className: 'text-right tabular-nums',
      render: (row) => row.sales_count.toLocaleString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon-sm" title="Editar">
            <Link href={`/admin/produtos/${row.id}`} aria-label={`Editar ${row.name}`}>
              <Pencil />
            </Link>
          </Button>

          {canWrite && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                title={row.status === 'active' ? 'Despublicar' : 'Publicar'}
                aria-label={
                  row.status === 'active' ? `Despublicar ${row.name}` : `Publicar ${row.name}`
                }
                disabled={busyId === row.id}
                onClick={() => void handleToggle(row)}
              >
                {row.status === 'active' ? <EyeOff /> : <Eye />}
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                title="Duplicar"
                aria-label={`Duplicar ${row.name}`}
                disabled={busyId === row.id}
                onClick={() => void handleDuplicate(row)}
              >
                <Copy />
              </Button>
            </>
          )}

          {canDelete && (
            <ConfirmDelete
              onConfirm={() => handleDelete(row)}
              title={`Excluir "${row.name}"?`}
              description="As avaliações e as chaves digitais deste produto são apagadas junto. Os pedidos antigos continuam existindo, mas perdem o vínculo. Para tirar da loja sem perder nada, use Arquivar."
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
      getRowHref={(row) => `/admin/produtos/${row.id}`}
      emptyMessage="Nenhum produto encontrado com estes filtros."
    />
  )
}
