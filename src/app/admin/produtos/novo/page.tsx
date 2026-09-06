import { ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import {
  EMPTY_PRODUCT,
  ProductForm,
  type ProductFormCategory,
  type ProductFormCollection,
} from '@/components/admin/product-form'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Novo produto' }

export default async function NewProductPage() {
  const user = await getSessionUser()

  if (!can(user, 'products.write')) {
    return (
      <>
        <PageHeader title="Novo produto" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não pode criar produtos"
          description="Peça a um super admin a permissão products.write."
        />
      </>
    )
  }

  const supabase = await createClient()

  const [{ data: categories }, { data: collections }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').order('position').order('name'),
    supabase.from('collections').select('id, name').order('position').order('name'),
  ])

  return (
    <>
      <PageHeader
        title="Novo produto"
        description="Preencha o essencial e salve — o resto dá para ajustar depois."
      />

      <ProductForm
        mode="create"
        initial={EMPTY_PRODUCT}
        categories={(categories ?? []) as ProductFormCategory[]}
        collections={(collections ?? []) as ProductFormCollection[]}
      />
    </>
  )
}
