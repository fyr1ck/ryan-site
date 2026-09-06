'use client'

import * as React from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deletePageAction, togglePagePublishedAction } from '@/actions/pages'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { formatDateTime } from '@/lib/utils'
import type { Page } from '@/lib/types/database.types'

export interface PagesTableProps {
  pages: Page[]
  canWrite: boolean
  canDelete: boolean
}

export function PagesTable({ pages, canWrite, canDelete }: PagesTableProps) {
  const [rows, setRows] = React.useState(pages)

  // Ajuste durante o render em vez de efeito: o refresh do servidor precisa
  // aparecer no mesmo commit, sem um frame com a lista antiga.
  const [syncedFrom, setSyncedFrom] = React.useState(pages)
  if (pages !== syncedFrom) {
    setSyncedFrom(pages)
    setRows(pages)
  }

  async function handleTogglePublished(page: Page, next: boolean) {
    const previous = rows
    setRows((current) =>
      current.map((row) => (row.id === page.id ? { ...row, is_published: next } : row))
    )

    const result = await togglePagePublishedAction({ id: page.id, is_published: next })
    if (!result.ok) {
      setRows(previous)
      toast.error(result.error ?? 'Não foi possível alterar a página.')
      return
    }
    toast.success(next ? 'Página publicada.' : 'Página em rascunho.')
  }

  async function handleDelete(page: Page) {
    const result = await deletePageAction({ id: page.id })
    // Lança para o ConfirmDelete segurar o diálogo aberto com o erro.
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir a página.')

    setRows((current) => current.filter((row) => row.id !== page.id))
    toast.success('Página excluída.')
  }

  const columns: DataTableColumn<Page>[] = [
    {
      key: 'title',
      header: 'Página',
      render: (page) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{page.title}</span>
          <span className="block truncate text-xs text-muted-foreground">/pagina/{page.slug}</span>
        </span>
      ),
    },
    {
      key: 'is_published',
      header: 'Status',
      render: (page) => (
        <span className="flex items-center gap-2">
          <Badge variant={page.is_published ? 'success' : 'muted'}>
            {page.is_published ? 'Publicada' : 'Rascunho'}
          </Badge>
          {canWrite && (
            <Switch
              checked={page.is_published}
              onCheckedChange={(next) => void handleTogglePublished(page, next)}
              aria-label={`${page.is_published ? 'Despublicar' : 'Publicar'} ${page.title}`}
            />
          )}
        </span>
      ),
    },
    {
      key: 'show_in_footer',
      header: 'Rodapé',
      render: (page) =>
        page.show_in_footer ? (
          <Badge variant="secondary">Sim · {page.position}</Badge>
        ) : (
          <span className="text-muted-foreground">Não</span>
        ),
    },
    {
      key: 'updated_at',
      header: 'Atualizada',
      render: (page) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDateTime(page.updated_at)}
        </span>
      ),
    },
    {
      key: 'acoes',
      header: 'Ações',
      className: 'text-right',
      render: (page) => (
        <span className="flex items-center justify-end gap-1">
          {page.is_published && (
            <Button asChild variant="ghost" size="icon-sm" title="Ver a página na loja">
              <Link href={`/pagina/${page.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                <span className="sr-only">Ver {page.title}</span>
              </Link>
            </Button>
          )}

          {canDelete && (
            <ConfirmDelete
              onConfirm={() => handleDelete(page)}
              title={`Excluir "${page.title}"?`}
              description="O endereço /pagina/… passa a dar 404. Para tirar do ar sem perder o texto, use o rascunho."
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  title="Excluir página"
                >
                  <Trash2 />
                  <span className="sr-only">Excluir {page.title}</span>
                </Button>
              }
            />
          )}
        </span>
      ),
    },
  ]

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Nenhuma página cadastrada"
        description="Termos de uso, política de privacidade e perguntas frequentes moram aqui."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/admin/paginas/nova">Nova página</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(page) => page.id}
      getRowHref={(page) => `/admin/paginas/${page.id}`}
    />
  )
}
