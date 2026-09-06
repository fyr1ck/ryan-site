import Link from 'next/link'
import { FolderPlus, ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/lib/types/database.types'

import { CategoriesTree, type CategoryNode } from './categories-tree'

export const metadata = { title: 'Categorias' }

type CategoryListRow = Pick<
  Category,
  'id' | 'name' | 'slug' | 'parent_id' | 'image_url' | 'is_active' | 'is_featured' | 'show_on_home'
>

/**
 * Lista plana → árvore.
 *
 * Categoria cujo pai não veio na lista (ou apontando para um id que sumiu)
 * entra como raiz: sumir da tela é o único jeito de ela ficar inalcançável.
 */
function buildTree(rows: CategoryListRow[], counts: Map<string, number>): CategoryNode[] {
  const byId = new Map<string, CategoryNode>()

  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      image_url: row.image_url,
      is_active: row.is_active,
      is_featured: row.is_featured,
      show_on_home: row.show_on_home,
      product_count: counts.get(row.id) ?? 0,
      children: [],
    })
  }

  const roots: CategoryNode[] = []
  for (const row of rows) {
    const node = byId.get(row.id)
    if (!node) continue
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

export default async function AdminCategoriesPage() {
  const user = await getSessionUser()

  if (!can(user, 'categories.read')) {
    return (
      <>
        <PageHeader title="Categorias" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso às categorias"
          description="Peça a um super admin a permissão categories.read."
        />
      </>
    )
  }

  const supabase = await createClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, parent_id, image_url, is_active, is_featured, show_on_home')
      .order('position')
      .order('name'),
    // Contagem por categoria numa consulta só: o PostgREST não agrupa, então
    // vêm os vínculos e a soma acontece aqui.
    supabase.from('products').select('category_id').limit(5000),
  ])

  const counts = new Map<string, number>()
  for (const row of (products ?? []) as { category_id: string | null }[]) {
    if (!row.category_id) continue
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
  }

  const rows = (categories ?? []) as CategoryListRow[]
  const tree = buildTree(rows, counts)

  const canWrite = can(user, 'categories.write')
  const canDelete = can(user, 'categories.delete')

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Arraste pelo punho para mudar a ordem. Subcategorias aparecem indentadas sob o pai."
      >
        {canWrite && (
          <Button asChild size="sm">
            <Link href="/admin/categorias/nova">
              <FolderPlus />
              Nova categoria
            </Link>
          </Button>
        )}
      </PageHeader>

      <CategoriesTree nodes={tree} canWrite={canWrite} canDelete={canDelete} />
    </>
  )
}
