import Link from 'next/link'
import { Plus, ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Collection } from '@/lib/types/database.types'

import { CollectionsTable, type CollectionRow } from './collections-table'

export const metadata = { title: 'Coleções' }

type CollectionListRow = Pick<
  Collection,
  'id' | 'name' | 'slug' | 'image_url' | 'is_active' | 'show_on_home'
>

export default async function AdminCollectionsPage() {
  const user = await getSessionUser()

  if (!can(user, 'collections.read')) {
    return (
      <>
        <PageHeader title="Coleções" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso às coleções"
          description="Peça a um super admin a permissão collections.read."
        />
      </>
    )
  }

  const supabase = await createClient()

  const [{ data: collections }, { data: links }] = await Promise.all([
    supabase
      .from('collections')
      .select('id, name, slug, image_url, is_active, show_on_home')
      .order('position')
      .order('name'),
    // Vínculos de todas as coleções numa consulta: contar por linha faria uma
    // ida ao banco por coleção listada.
    supabase.from('collection_products').select('collection_id').limit(10_000),
  ])

  const counts = new Map<string, number>()
  for (const row of (links ?? []) as { collection_id: string }[]) {
    counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1)
  }

  const rows: CollectionRow[] = ((collections ?? []) as CollectionListRow[]).map((collection) => ({
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    image_url: collection.image_url,
    is_active: collection.is_active,
    show_on_home: collection.show_on_home,
    product_count: counts.get(collection.id) ?? 0,
  }))

  const canWrite = can(user, 'collections.write')
  const canDelete = can(user, 'collections.delete')

  return (
    <>
      <PageHeader
        title="Coleções"
        description="Agrupamentos de curadoria que atravessam as categorias."
      >
        {canWrite && (
          <Button asChild size="sm">
            <Link href="/admin/colecoes/nova">
              <Plus />
              Nova coleção
            </Link>
          </Button>
        )}
      </PageHeader>

      <CollectionsTable rows={rows} canDelete={canDelete} />
    </>
  )
}
