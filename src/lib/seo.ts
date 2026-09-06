import type { Metadata } from 'next'
import { stripHtml } from '@/lib/sanitize'
import type { StoreSettings } from '@/lib/queries/settings'
import type { Product, ProductImage, Review } from '@/lib/types/database.types'

/**
 * Helpers de SEO da vitrine.
 *
 * Regra de ouro: nada aqui toca o banco. São funções puras que recebem o que
 * a página já carregou e devolvem Metadata do Next ou JSON-LD. Assim o mesmo
 * helper serve generateMetadata(), o layout e os blocos <script type="application/ld+json">.
 */

/** Objeto JSON-LD pronto para JSON.stringify. */
export type JsonLd = Record<string, unknown>

export const SITE_NAME = 'Roblox Store'

/** Sem barra no fim — todo o resto do arquivo assume isso ao concatenar. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')

export const DEFAULT_OG_IMAGE = '/placeholders/og.svg'

/** Caminho relativo vira URL absoluta; URL absoluta passa intacta. */
export function absoluteUrl(path: string | null | undefined = '/'): string {
  if (!path) return SITE_URL
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** metadataBase inválido quebraria o build inteiro por causa de um env errado. */
function metadataBase(): URL | undefined {
  try {
    return new URL(SITE_URL)
  } catch {
    return undefined
  }
}

export interface BuildMetadataInput {
  title: string
  description: string
  /** Caminho ou URL da imagem de compartilhamento. Cai no OG padrão da loja. */
  image?: string | null
  /** Caminho da página, usado no canonical e no og:url. */
  path?: string
  noIndex?: boolean
  siteName?: string
  type?: 'website' | 'article'
}

/**
 * Metadata completa: canonical, OpenGraph e Twitter card.
 * A descrição passa por stripHtml porque muita coisa vem do CMS com <p> dentro.
 */
export function buildMetadata({
  title,
  description,
  image,
  path = '/',
  noIndex = false,
  siteName = SITE_NAME,
  type = 'website',
}: BuildMetadataInput): Metadata {
  const url = absoluteUrl(path)
  // SVG nao serve como og:image: Facebook, WhatsApp, X e LinkedIn simplesmente
  // nao renderizam — o link sai sem imagem. Quando o valor configurado for SVG
  // (o placeholder da loja e um), cai na rota /opengraph-image, que gera PNG.
  const imagemEscolhida = image || DEFAULT_OG_IMAGE
  const ogImage = /\.svg$/i.test(imagemEscolhida)
    ? absoluteUrl('/opengraph-image')
    : absoluteUrl(imagemEscolhida)
  const desc = stripHtml(description, 200)

  return {
    metadataBase: metadataBase(),
    title,
    description: desc,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
    openGraph: {
      type,
      url,
      siteName,
      title,
      description: desc,
      locale: 'pt_BR',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [ogImage],
    },
  }
}

/** Espelha availableStock() do catálogo, sem importar o módulo server-only. */
function offerAvailability(product: Product): string {
  if (product.stock_policy === 'unlimited') return 'https://schema.org/InStock'
  const left = product.stock_quantity - product.stock_reserved
  return left > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
}

/** Centavos viram "69.90" — o schema.org exige ponto decimal, não vírgula. */
function schemaPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * schema.org/Product do rich result do Google.
 * aggregateRating só entra quando existe avaliação de verdade: mandar
 * ratingCount 0 derruba o rich result inteiro na validação.
 */
export function productJsonLd(
  product: Product,
  images: ProductImage[] = [],
  reviews: Review[] = []
): JsonLd {
  const url = absoluteUrl(`/produto/${product.slug}`)

  const imageUrls = [...images]
    .sort((a, b) => a.position - b.position)
    .map((img) => absoluteUrl(img.url))

  const approved = reviews.filter((review) => review.is_approved)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    sku: product.sku || product.short_code,
    description: stripHtml(product.short_description || product.description, 300),
    image: imageUrls.length > 0 ? imageUrls : [absoluteUrl(DEFAULT_OG_IMAGE)],
    ...(product.tags.length > 0 ? { keywords: product.tags.join(', ') } : {}),
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BRL',
      price: schemaPrice(product.price_cents),
      availability: offerAvailability(product),
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    },
    ...(product.rating_count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating_average.toFixed(1),
            reviewCount: product.rating_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(approved.length > 0
      ? {
          review: approved.map((review) => ({
            '@type': 'Review',
            datePublished: review.created_at,
            author: { '@type': 'Person', name: review.customer_name },
            reviewRating: {
              '@type': 'Rating',
              ratingValue: review.rating,
              bestRating: 5,
              worstRating: 1,
            },
            ...(review.comment ? { reviewBody: stripHtml(review.comment, 500) } : {}),
          })),
        }
      : {}),
  }
}

export interface BreadcrumbItem {
  name: string
  /** Caminho relativo ("/produtos") ou URL absoluta. */
  url: string
}

/** Trilha de navegação que o Google mostra no lugar da URL crua. */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  }
}

/** Identidade da loja: nome, logo e perfis sociais preenchidos no painel. */
export function organizationJsonLd(settings: StoreSettings): JsonLd {
  const sameAs = [
    settings.instagram_url,
    settings.discord_url,
    settings.youtube_url,
    settings.tiktok_url,
    settings.whatsapp_url,
  ].filter((value): value is string => Boolean(value))

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: settings.store_name || SITE_NAME,
    url: SITE_URL,
    description: stripHtml(settings.store_description || settings.store_tagline, 300),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl(settings.logo_url || '/placeholders/logo.svg'),
    },
    image: absoluteUrl(settings.seo_og_image || DEFAULT_OG_IMAGE),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(settings.contact_email
      ? {
          contactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              email: settings.contact_email,
              availableLanguage: ['Portuguese'],
            },
          ],
        }
      : {}),
  }
}
