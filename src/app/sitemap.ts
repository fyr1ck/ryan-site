import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/seo'

/**
 * Sitemap dinâmico da vitrine.
 *
 * Usa o client com chave anon de propósito: o RLS já esconde rascunho,
 * categoria desativada e página despublicada. Se alguém arquivar um produto
 * no painel, ele some daqui sozinho — sem filtro duplicado para manter.
 */

/**
 * Rota dinâmica na marra: createClient() lê os cookies da sessão, então o Next
 * nunca conseguiria gerar este arquivo em build. Deixar explícito evita a
 * surpresa de um `revalidate` que o dynamic API silenciosamente ignora.
 */
export const dynamic = 'force-dynamic'

/** Teto de segurança para o dia em que o catálogo crescer. */
const MAX_ROWS = 5000

interface SitemapRow {
  slug: string
  updated_at: string
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const [products, categories, collections, pages] = await Promise.all([
    supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS),
    supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .order('position')
      .limit(MAX_ROWS),
    supabase
      .from('collections')
      .select('slug, updated_at')
      .eq('is_active', true)
      .order('position')
      .limit(MAX_ROWS),
    supabase
      .from('pages')
      .select('slug, updated_at')
      .eq('is_published', true)
      .order('position')
      .limit(MAX_ROWS),
  ])

  const rows = (result: { data: unknown }): SitemapRow[] => (result.data as SitemapRow[]) ?? []

  const lastModified = (value: string | null | undefined): Date => {
    const date = value ? new Date(value) : null
    return date && !Number.isNaN(date.getTime()) ? date : new Date()
  }

  const newest = (list: SitemapRow[]): Date =>
    list.reduce<Date>((acc, row) => {
      const date = lastModified(row.updated_at)
      return date > acc ? date : acc
    }, new Date(0))

  const productRows = rows(products)
  const categoryRows = rows(categories)
  const collectionRows = rows(collections)
  const pageRows = rows(pages)

  const catalogUpdatedAt = productRows.length > 0 ? newest(productRows) : new Date()

  return [
    {
      url: SITE_URL,
      lastModified: catalogUpdatedAt,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/produtos`,
      lastModified: catalogUpdatedAt,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...productRows.map((row) => ({
      url: `${SITE_URL}/produto/${row.slug}`,
      lastModified: lastModified(row.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...categoryRows.map((row) => ({
      url: `${SITE_URL}/categoria/${row.slug}`,
      lastModified: lastModified(row.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...collectionRows.map((row) => ({
      url: `${SITE_URL}/colecao/${row.slug}`,
      lastModified: lastModified(row.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...pageRows.map((row) => ({
      url: `${SITE_URL}/pagina/${row.slug}`,
      lastModified: lastModified(row.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ]
}
