import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PackageCheck, QrCode, ShieldCheck, Zap } from 'lucide-react'

import { AddToCartButton } from '@/components/cart/add-to-cart-button'
import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { Price } from '@/components/store/price'
import { ProductCarousel } from '@/components/store/product-carousel'
import { ProductGallery } from '@/components/store/product-gallery'
import { RatingSummary } from '@/components/store/rating-summary'
import { ReviewList } from '@/components/store/review-list'
import { Badge } from '@/components/ui/badge'
import {
  availableStock,
  getProductBySlug,
  getProductReviews,
  getRelatedProducts,
} from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/settings'
import { sanitizeHtml, stripHtml } from '@/lib/sanitize'
import { breadcrumbJsonLd, buildMetadata, productJsonLd, type JsonLd } from '@/lib/seo'
import type { ProductImage, ProductWithImages } from '@/lib/types/database.types'

/** Imagens na ordem definida no painel. */
function sortedImages(product: ProductWithImages): ProductImage[] {
  return [...(product.product_images ?? [])].sort((a, b) => a.position - b.position)
}

/** Frase de estoque da linha de metadados. */
function stockLabel(stock: number | null): string {
  if (stock === null) return 'Em estoque'
  if (stock <= 0) return 'Esgotado'
  return `${stock} em estoque`
}

/**
 * JSON-LD seguro dentro de <script>.
 *
 * O escape do "<" é obrigatório: um "</script>" no meio da descrição do
 * produto fecharia a tag e o resto do JSON viraria HTML executável.
 */
function jsonLdHtml(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)

  if (!product) {
    return buildMetadata({
      title: 'Produto não encontrado',
      description: 'Este produto saiu do catálogo ou o link está errado.',
      path: `/produto/${slug}`,
      noIndex: true,
    })
  }

  const settings = await getStoreSettings()
  const cover = sortedImages(product)[0]?.url ?? settings.seo_og_image

  return buildMetadata({
    title: product.seo_title || product.name,
    description:
      product.seo_description ||
      stripHtml(product.short_description || product.description, 200) ||
      `${product.name} com entrega imediata e pagamento via Pix na ${settings.store_name}.`,
    image: cover,
    path: `/produto/${product.slug}`,
    type: 'article',
  })
}

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProductBySlug(slug)

  if (!product) notFound()

  const [reviews, related] = await Promise.all([
    getProductReviews(product.id, 20),
    getRelatedProducts(product.id, product.category_id, 12),
  ])

  const images = sortedImages(product)
  const stock = availableStock(product)
  const soldOut = stock !== null && stock <= 0
  const category = product.categories ?? null
  const description = sanitizeHtml(product.description)

  const trail = [
    ...(category ? [{ label: category.name, href: `/categoria/${category.slug}` }] : []),
    { label: product.name },
  ]

  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Início', url: '/' },
    ...(category ? [{ name: category.name, url: `/categoria/${category.slug}` }] : []),
    { name: product.name, url: `/produto/${product.slug}` },
  ])

  return (
    <div className="container-store flex flex-col gap-8 py-4 lg:gap-12 lg:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(productJsonLd(product, images, reviews)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }}
      />

      <div className="flex flex-col gap-4">
        <Breadcrumbs items={trail} />

        {/* Empilhado no celular; galeria e compra lado a lado a partir do lg:. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ProductGallery images={images} productName={product.name} />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
                {product.sales_count > 0 && (
                  <span>
                    {product.sales_count} {product.sales_count === 1 ? 'venda' : 'vendas'}
                  </span>
                )}
                <span className={soldOut ? 'text-destructive' : 'text-success'}>
                  {stockLabel(stock)}
                </span>
                <Badge variant={product.delivery_type === 'automatic' ? 'success' : 'secondary'}>
                  <PackageCheck className="size-3.5" aria-hidden />
                  {product.delivery_type === 'automatic' ? 'Entrega automática' : 'Entrega manual'}
                </Badge>
              </div>

              {product.short_description && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {product.short_description}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <Price
                priceCents={product.price_cents}
                compareAtCents={product.compare_at_cents}
                size="lg"
              />

              <div className="mt-4 flex flex-col gap-2">
                <AddToCartButton product={product} stock={stock} variant="buy" />
                <AddToCartButton product={product} stock={stock} variant="add" />
              </div>
            </div>

            <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Seal
                icon={<Zap />}
                title="Entrega imediata"
                text="Seu pedido é liberado assim que o pagamento é confirmado."
              />
              <Seal
                icon={<ShieldCheck />}
                title="Compra segura"
                text="Dados protegidos e suporte da loja em caso de problema."
              />
              <Seal
                icon={<QrCode />}
                title="Pagamento via Pix"
                text="Aprovação em segundos, sem cartão e sem taxa extra."
              />
            </ul>
          </div>
        </div>
      </div>

      {description && (
        <section className="flex flex-col gap-3" aria-labelledby="descricao">
          <h2 id="descricao" className="text-lg font-bold sm:text-xl">
            Descrição
          </h2>
          {/* O HTML vem do painel e já passou por sanitizeHtml(). */}
          <div className="prose-store max-w-3xl" dangerouslySetInnerHTML={{ __html: description }} />
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="avaliacoes">
        <h2 id="avaliacoes" className="text-lg font-bold sm:text-xl">
          Avaliações
        </h2>
        <RatingSummary
          average={product.rating_average}
          total={product.rating_count}
          reviews={reviews}
        />
        <ReviewList reviews={reviews} />
      </section>

      <ProductCarousel
        title="Produtos similares"
        products={related}
        viewAllHref={category ? `/categoria/${category.slug}` : '/produtos'}
      />
    </div>
  )
}

function Seal({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{text}</span>
      </span>
    </li>
  )
}
