import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import {
  ProductForm,
  type ProductFormCategory,
  type ProductFormCollection,
  type ProductFormInitial,
} from '@/components/admin/product-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Product, ProductImage } from '@/lib/types/database.types'
import { formatDateTime } from '@/lib/utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ProductWithRelations = Product & {
  product_images: Pick<ProductImage, 'url' | 'alt' | 'position'>[] | null
  collection_products: { collection_id: string; position: number }[] | null
  product_categories: { category_id: string; position: number }[] | null
}

/** Um id fora do formato UUID viraria erro 22P02 no Postgres — 404 é a resposta certa. */
async function loadProduct(id: string): Promise<ProductWithRelations | null> {
  if (!UUID_RE.test(id)) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(
      `*,
       product_images (url, alt, position),
       collection_products (collection_id, position),
       product_categories (category_id, position)`
    )
    .eq('id', id)
    .maybeSingle()

  return (data as ProductWithRelations) ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const product = await loadProduct(id)
  return { title: product ? product.name : 'Produto' }
}

function sortedBy<T extends { position: number }>(rows: T[] | null): T[] {
  return [...(rows ?? [])].sort((a, b) => a.position - b.position)
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()

  if (!can(user, 'products.read')) {
    return (
      <>
        <PageHeader title="Produto" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso ao catálogo"
          description="Peça a um super admin a permissão products.read."
        />
      </>
    )
  }

  const product = await loadProduct(id)
  if (!product) notFound()

  const supabase = await createClient()
  const [{ data: categories }, { data: collections }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').order('position').order('name'),
    supabase.from('collections').select('id, name').order('position').order('name'),
  ])

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    price_cents: product.price_cents,
    compare_at_cents: product.compare_at_cents,
    cost_cents: product.cost_cents,
    sku: product.sku ?? '',
    status: product.status,
    category_id: product.category_id,
    delivery_type: product.delivery_type,
    stock_policy: product.stock_policy,
    stock_quantity: product.stock_quantity,
    tags: product.tags ?? [],
    is_featured: product.is_featured,
    seo_title: product.seo_title ?? '',
    seo_description: product.seo_description ?? '',
    images: sortedBy(product.product_images).map((image) => ({
      url: image.url,
      alt: image.alt,
    })),
    collection_ids: sortedBy(product.collection_products).map((row) => row.collection_id),
    category_ids: sortedBy(product.product_categories).map((row) => row.category_id),
  }

  const canWrite = can(user, 'products.write')

  return (
    <>
      <PageHeader
        title={product.name}
        description={`Código ${product.short_code} · ${product.sales_count.toLocaleString('pt-BR')} venda(s) · atualizado em ${formatDateTime(product.updated_at)}`}
      >
        {product.status === 'active' && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/produto/${product.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Ver na loja
            </Link>
          </Button>
        )}
      </PageHeader>

      {!canWrite && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <Badge variant="warning">Somente leitura</Badge>
          <span className="text-muted-foreground">
            Você pode ver este produto, mas não salvar alterações.
          </span>
        </div>
      )}

      <ProductForm
        mode="edit"
        initial={initial}
        categories={(categories ?? []) as ProductFormCategory[]}
        collections={(collections ?? []) as ProductFormCollection[]}
      />
    </>
  )
}
