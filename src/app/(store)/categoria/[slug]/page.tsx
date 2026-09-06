import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { CategoryGrid } from '@/components/store/category-grid'
import { ProductCarousel } from '@/components/store/product-carousel'
import { ProductGrid } from '@/components/store/product-grid'
import {
  getCategories,
  getCategoryBySlug,
  getCategoryProducts,
} from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/settings'
import { stripHtml } from '@/lib/sanitize'
import { buildMetadata } from '@/lib/seo'

/** Teto da grade principal: o suficiente para uma categoria cheia sem paginar. */
const GRID_LIMIT = 48
const CAROUSEL_LIMIT = 12

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)

  if (!category) {
    return buildMetadata({
      title: 'Categoria não encontrada',
      description: 'Esta categoria saiu do ar ou o link está errado.',
      path: `/categoria/${slug}`,
      noIndex: true,
    })
  }

  const settings = await getStoreSettings()

  return buildMetadata({
    title: category.seo_title || category.name,
    description:
      category.seo_description ||
      stripHtml(category.description, 200) ||
      `Tudo de ${category.name} na ${settings.store_name}, com entrega imediata e pagamento via Pix.`,
    image: category.banner_url || category.image_url || settings.seo_og_image,
    path: `/categoria/${category.slug}`,
  })
}

export default async function CategoriaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)

  if (!category) notFound()

  const [allCategories, products] = await Promise.all([
    getCategories(),
    getCategoryProducts(category.id, GRID_LIMIT),
  ])

  const parent = category.parent_id
    ? (allCategories.find((item) => item.id === category.parent_id) ?? null)
    : null

  const children = allCategories.filter((item) => item.parent_id === category.id)

  // Só as filhas marcadas no painel viram carrossel — as demais aparecem
  // apenas como atalho na grade de subcategorias.
  const highlighted = children.filter((child) => child.show_on_home)
  const highlightedProducts = await Promise.all(
    highlighted.map((child) => getCategoryProducts(child.id, CAROUSEL_LIMIT))
  )

  const trail = [
    ...(parent ? [{ label: parent.name, href: `/categoria/${parent.slug}` }] : []),
    { label: category.name },
  ]

  return (
    <div className="container-store flex flex-col gap-6 py-4 lg:gap-10 lg:py-8">
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={trail} />

        {category.banner_url && (
          <div className="relative aspect-[16/6] w-full overflow-hidden rounded-xl border border-border bg-muted sm:aspect-[16/5]">
            <Image
              src={category.banner_url}
              alt=""
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              // Os placeholders da loja são SVG e o otimizador não os aceita.
              unoptimized={category.banner_url.endsWith('.svg')}
              className="object-cover"
            />
          </div>
        )}

        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold sm:text-2xl">{category.name}</h1>
          {category.description && (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {category.description}
            </p>
          )}
        </header>
      </div>

      {children.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="subcategorias">
          <h2 id="subcategorias" className="text-base font-bold sm:text-xl">
            Subcategorias
          </h2>
          <CategoryGrid categories={children} />
        </section>
      )}

      {highlighted.map((child, index) => (
        <ProductCarousel
          key={child.id}
          title={child.name}
          subtitle={child.description ?? undefined}
          products={highlightedProducts[index] ?? []}
          viewAllHref={`/categoria/${child.slug}`}
        />
      ))}

      <section className="flex flex-col gap-3" aria-labelledby="produtos-da-categoria">
        <h2 id="produtos-da-categoria" className="text-base font-bold sm:text-xl">
          {children.length > 0 ? `Todos de ${category.name}` : 'Produtos'}
        </h2>
        <ProductGrid
          products={products}
          emptyMessage={`Ainda não há produtos em ${category.name}. Veja as outras categorias da loja.`}
        />
      </section>
    </div>
  )
}
