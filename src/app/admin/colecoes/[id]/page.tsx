import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Collection, ProductStatus } from '@/lib/types/database.types'
import type { CollectionProductOption } from '@/actions/catalog-shared'
import { formatDateTime } from '@/lib/utils'

import { CollectionForm, type CollectionFormInitial } from '../collection-form'
import { CollectionProductsManager } from '../collection-products-manager'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CollectionProductLink {
  position: number
  products: {
    id: string
    name: string
    slug: string
    price_cents: number
    status: ProductStatus
    product_images: { url: string; position: number }[] | null
  } | null
}

async function loadCollection(id: string): Promise<Collection | null> {
  if (!UUID_RE.test(id)) return null

  const supabase = await createClient()
  const { data } = await supabase.from('collections').select('*').eq('id', id).maybeSingle()
  return (data as Collection) ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const collection = await loadCollection(id)
  return { title: collection ? collection.name : 'Coleção' }
}

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getSessionUser()

  if (!can(user, 'collections.read')) {
    return (
      <>
        <PageHeader title="Coleção" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso às coleções"
          description="Peça a um super admin a permissão collections.read."
        />
      </>
    )
  }

  const collection = await loadCollection(id)
  if (!collection) notFound()

  const supabase = await createClient()
  const { data: links } = await supabase
    .from('collection_products')
    .select('position, products (id, name, slug, price_cents, status, product_images (url, position))')
    .eq('collection_id', collection.id)
    .order('position')

  const products: CollectionProductOption[] = ((links ?? []) as unknown as CollectionProductLink[])
    .map((link) => link.products)
    .filter((product): product is NonNullable<CollectionProductLink['products']> => !!product)
    .map((product) => {
      const cover = [...(product.product_images ?? [])].sort((a, b) => a.position - b.position)[0]
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price_cents: product.price_cents,
        status: product.status,
        image_url: cover?.url ?? null,
      }
    })

  const initial: CollectionFormInitial = {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    description: collection.description ?? '',
    image_url: collection.image_url,
    banner_url: collection.banner_url,
    is_active: collection.is_active,
    show_on_home: collection.show_on_home,
    seo_title: collection.seo_title ?? '',
    seo_description: collection.seo_description ?? '',
  }

  const canWrite = can(user, 'collections.write')

  return (
    <>
      <PageHeader
        title={collection.name}
        description={`/colecao/${collection.slug} · ${products.length} produto(s) · atualizada em ${formatDateTime(collection.updated_at)}`}
      />

      {!canWrite && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <Badge variant="warning">Somente leitura</Badge>
          <span className="text-muted-foreground">
            Você pode ver esta coleção, mas não salvar alterações.
          </span>
        </div>
      )}

      <CollectionForm
        mode="edit"
        initial={initial}
        productsSlot={
          <CollectionProductsManager
            collectionId={collection.id}
            initial={products}
            canWrite={canWrite}
          />
        }
      />
    </>
  )
}
