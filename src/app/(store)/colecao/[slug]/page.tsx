import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { ProductGrid } from '@/components/store/product-grid'
import { getCollectionBySlug, getCollectionProducts } from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/settings'
import { stripHtml } from '@/lib/sanitize'
import { buildMetadata } from '@/lib/seo'

/** Coleção é curadoria manual: não pagina, mostra o que o painel ordenou. */
const GRID_LIMIT = 48

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)

  if (!collection) {
    return buildMetadata({
      title: 'Coleção não encontrada',
      description: 'Esta coleção saiu do ar ou o link está errado.',
      path: `/colecao/${slug}`,
      noIndex: true,
    })
  }

  const settings = await getStoreSettings()

  return buildMetadata({
    title: collection.seo_title || collection.name,
    description:
      collection.seo_description ||
      stripHtml(collection.description, 200) ||
      `Seleção ${collection.name} da ${settings.store_name}, com entrega imediata e pagamento via Pix.`,
    image: collection.banner_url || collection.image_url || settings.seo_og_image,
    path: `/colecao/${collection.slug}`,
  })
}

export default async function ColecaoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)

  if (!collection) notFound()

  const products = await getCollectionProducts(collection.id, GRID_LIMIT)

  return (
    <div className="container-store flex flex-col gap-6 py-4 lg:gap-8 lg:py-8">
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: collection.name }]} />

        {collection.banner_url && (
          <div className="relative aspect-[16/6] w-full overflow-hidden rounded-xl border border-border bg-muted sm:aspect-[16/5]">
            <Image
              src={collection.banner_url}
              alt=""
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              // Os placeholders da loja são SVG e o otimizador não os aceita.
              unoptimized={collection.banner_url.endsWith('.svg')}
              className="object-cover"
            />
          </div>
        )}

        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold sm:text-2xl">{collection.name}</h1>
          {collection.description && (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {collection.description}
            </p>
          )}
        </header>
      </div>

      <ProductGrid
        products={products}
        emptyMessage={`A coleção ${collection.name} ainda está sendo montada. Volte em breve.`}
      />
    </div>
  )
}
