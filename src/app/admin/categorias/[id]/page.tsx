import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/lib/types/database.types'
import { formatDateTime } from '@/lib/utils'

import {
  CategoryForm,
  type CategoryFormInitial,
  type CategoryOption,
} from '../category-form'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadCategory(id: string): Promise<Category | null> {
  if (!UUID_RE.test(id)) return null

  const supabase = await createClient()
  const { data } = await supabase.from('categories').select('*').eq('id', id).maybeSingle()
  return (data as Category) ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const category = await loadCategory(id)
  return { title: category ? category.name : 'Categoria' }
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()

  if (!can(user, 'categories.read')) {
    return (
      <>
        <PageHeader title="Categoria" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso às categorias"
          description="Peça a um super admin a permissão categories.read."
        />
      </>
    )
  }

  const category = await loadCategory(id)
  if (!category) notFound()

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .order('position')
    .order('name')

  const initial: CategoryFormInitial = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    parent_id: category.parent_id,
    image_url: category.image_url,
    banner_url: category.banner_url,
    position: category.position,
    is_active: category.is_active,
    is_featured: category.is_featured,
    show_on_home: category.show_on_home,
    seo_title: category.seo_title ?? '',
    seo_description: category.seo_description ?? '',
  }

  const canWrite = can(user, 'categories.write')

  return (
    <>
      <PageHeader
        title={category.name}
        description={`/categoria/${category.slug} · atualizada em ${formatDateTime(category.updated_at)}`}
      />

      {!canWrite && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <Badge variant="warning">Somente leitura</Badge>
          <span className="text-muted-foreground">
            Você pode ver esta categoria, mas não salvar alterações.
          </span>
        </div>
      )}

      <CategoryForm
        mode="edit"
        initial={initial}
        categories={(categories ?? []) as CategoryOption[]}
      />
    </>
  )
}
