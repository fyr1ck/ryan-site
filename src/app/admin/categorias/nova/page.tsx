import { ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { CategoryForm, EMPTY_CATEGORY, type CategoryOption } from '../category-form'

export const metadata = { title: 'Nova categoria' }

export default async function NewCategoryPage() {
  const user = await getSessionUser()

  if (!can(user, 'categories.write')) {
    return (
      <>
        <PageHeader title="Nova categoria" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não pode criar categorias"
          description="Peça a um super admin a permissão categories.write."
        />
      </>
    )
  }

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .order('position')
    .order('name')

  return (
    <>
      <PageHeader
        title="Nova categoria"
        description="Categorias organizam o menu, a busca e os carrosséis da home."
      />

      <CategoryForm
        mode="create"
        initial={EMPTY_CATEGORY}
        categories={(categories ?? []) as CategoryOption[]}
      />
    </>
  )
}
