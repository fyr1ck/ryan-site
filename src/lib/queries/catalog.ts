import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
  Category,
  Collection,
  ProductWithImages,
  Review,
} from '@/lib/types/database.types'

/** Colunas que a vitrine precisa. Evita trazer custo, SKU e afins ao público. */
const PRODUCT_CARD_FIELDS = `
  id, short_code, name, slug, short_description, price_cents, compare_at_cents,
  status, category_id, delivery_type, stock_policy, stock_quantity, stock_reserved,
  tags, is_featured, position, sales_count, rating_average, rating_count,
  created_at, updated_at, description, cost_cents, sku, seo_title, seo_description,
  product_images (id, product_id, url, alt, position, created_at)
`

/**
 * Erro de query e "nao ha resultado" sao coisas diferentes.
 *
 * O supabase-js devolve os dois como `data: null`, e tratar ambos como lista
 * vazia esconde falha de schema: uma relacao ambigua ou uma policy nova viram
 * "catalogo vazio" sem nada no log. Registrar aqui e o que torna esse tipo de
 * quebra visivel.
 */
function logQueryError(context: string, error: { message: string; code?: string } | null): void {
  if (error) console.error(`[catalog:${context}] ${error.code ?? ''} ${error.message}`.trim())
}

export type SortOption = 'relevancia' | 'mais-vendidos' | 'menor-preco' | 'maior-preco' | 'novidades'

export interface ProductFilters {
  search?: string
  categorySlug?: string
  collectionSlug?: string
  minCents?: number
  maxCents?: number
  tags?: string[]
  onlyAvailable?: boolean
  onlyOnSale?: boolean
  sort?: SortOption
  page?: number
  perPage?: number
}

/** Estoque disponível calculado no cliente a partir do que já veio na query,
 *  para não disparar uma chamada RPC por card no grid. */
export function availableStock(product: {
  stock_policy: string
  stock_quantity: number
  stock_reserved: number
}): number | null {
  if (product.stock_policy === 'unlimited') return null
  return Math.max(product.stock_quantity - product.stock_reserved, 0)
}

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('position')
    .order('name')

  logQueryError('getCategories', error)
  return (data as Category[]) ?? []
})

export const getFeaturedCategories = cache(async (): Promise<Category[]> => {
  const all = await getCategories()
  return all.filter((c) => c.is_featured)
})

export const getCategoryBySlug = cache(async (slug: string): Promise<Category | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  logQueryError('getCategoryBySlug', error)
  return (data as Category) ?? null
})

export const getCollections = cache(async (): Promise<Collection[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_active', true)
    .order('position')

  logQueryError('getCollections', error)
  return (data as Collection[]) ?? []
})

export const getCollectionBySlug = cache(async (slug: string): Promise<Collection | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  logQueryError('getCollectionBySlug', error)
  return (data as Collection) ?? null
})

/** Produtos de uma coleção, respeitando a ordem definida no painel. */
export const getCollectionProducts = cache(
  async (collectionId: string, limit = 12): Promise<ProductWithImages[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('collection_products')
      .select(`position, products (${PRODUCT_CARD_FIELDS})`)
      .eq('collection_id', collectionId)
      .order('position')
      .limit(limit)

    logQueryError('getCollectionProducts', error)
    return ((data ?? [])
      .map((row) => (row as unknown as { products: ProductWithImages }).products)
      .filter((p): p is ProductWithImages => !!p && p.status === 'active'))
  }
)

/** Produtos de uma categoria — inclui os das subcategorias e os vinculados
 *  via product_categories (um produto pode aparecer em vários carrosséis). */
export const getCategoryProducts = cache(
  async (categoryId: string, limit = 12): Promise<ProductWithImages[]> => {
    const supabase = await createClient()

    const { data: children } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', categoryId)
      .eq('is_active', true)

    const categoryIds = [categoryId, ...(children ?? []).map((c) => c.id)]

    const [primary, secondary] = await Promise.all([
      supabase
        .from('products')
        .select(PRODUCT_CARD_FIELDS)
        .eq('status', 'active')
        .in('category_id', categoryIds)
        .order('position')
        .limit(limit),
      supabase
        .from('product_categories')
        .select(`position, products (${PRODUCT_CARD_FIELDS})`)
        .in('category_id', categoryIds)
        .order('position')
        .limit(limit),
    ])

    const fromSecondary = (secondary.data ?? [])
      .map((row) => (row as unknown as { products: ProductWithImages }).products)
      .filter((p): p is ProductWithImages => !!p && p.status === 'active')

    // Dedup: o mesmo produto pode vir pelos dois caminhos
    const seen = new Set<string>()
    const merged: ProductWithImages[] = []
    for (const product of [...((primary.data as ProductWithImages[]) ?? []), ...fromSecondary]) {
      if (seen.has(product.id)) continue
      seen.add(product.id)
      merged.push(product)
    }

    return merged.slice(0, limit)
  }
)

export const getFeaturedProducts = cache(async (limit = 8): Promise<ProductWithImages[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_CARD_FIELDS)
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('position')
    .limit(limit)

  logQueryError('getFeaturedProducts', error)
  return (data as ProductWithImages[]) ?? []
})

export const getProductBySlug = cache(async (slug: string): Promise<ProductWithImages | null> => {
  const supabase = await createClient()

  // Aceita slug OU short_code, para servir tanto /produto/conta-nivel-maximo
  // quanto a URL curta /produto/AbC123
  //
  // `categories!products_category_id_fkey` desambigua de propósito: existem
  // DOIS caminhos de products para categories (a FK direta category_id e a
  // junção product_categories). Escrever só `categories` faz o PostgREST
  // recusar a query inteira com PGRST201 — e a página vira "não encontrado".
  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_CARD_FIELDS}, categories!products_category_id_fkey (id, name, slug)`)
    .or(`slug.eq.${slug},short_code.eq.${slug}`)
    .eq('status', 'active')
    .maybeSingle()

  // Erro de query não é "produto inexistente". Engolir os dois como null
  // transforma qualquer falha de schema num 404 silencioso.
  if (error) {
    console.error('[getProductBySlug]', slug, error)
    return null
  }

  if (!data) return null

  // Sem os tipos gerados do Supabase, o join vem tipado como array. A FK
  // category_id é many-to-one, então na prática é um objeto (ou null).
  const row = data as unknown as Omit<ProductWithImages, 'categories'> & {
    categories: Pick<Category, 'id' | 'name' | 'slug'> | Pick<Category, 'id' | 'name' | 'slug'>[] | null
  }

  return {
    ...row,
    categories: Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories,
  }
})

export const getRelatedProducts = cache(
  async (productId: string, categoryId: string | null, limit = 8): Promise<ProductWithImages[]> => {
    const supabase = await createClient()
    let query = supabase
      .from('products')
      .select(PRODUCT_CARD_FIELDS)
      .eq('status', 'active')
      .neq('id', productId)
      .limit(limit)

    if (categoryId) query = query.eq('category_id', categoryId)

    const { data, error } = await query.order('sales_count', { ascending: false })

    logQueryError('getRelatedProducts', error)
    return (data as ProductWithImages[]) ?? []
  }
)

export const getProductReviews = cache(
  async (productId: string, limit = 20): Promise<Review[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    logQueryError('getProductReviews', error)
    return (data as Review[]) ?? []
  }
)

export const getRecentReviews = cache(
  async (limit = 12): Promise<(Review & { products: { name: string; slug: string } | null })[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reviews')
      .select('*, products (name, slug)')
      .eq('is_approved', true)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    logQueryError('getRecentReviews', error)
    return (data as never) ?? []
  }
)

/** Busca + filtros + ordenação + paginação da listagem /produtos. */
export async function searchProducts(filters: ProductFilters): Promise<{
  products: ProductWithImages[]
  total: number
  page: number
  perPage: number
  totalPages: number
}> {
  const supabase = await createClient()
  const page = Math.max(filters.page ?? 1, 1)
  const perPage = Math.min(Math.max(filters.perPage ?? 24, 1), 48)
  const from = (page - 1) * perPage

  let query = supabase
    .from('products')
    .select(PRODUCT_CARD_FIELDS, { count: 'exact' })
    .eq('status', 'active')

  if (filters.search?.trim()) {
    const term = filters.search.trim()
    // websearch_to_tsquery entende aspas e operadores que o usuário digita
    query = query.textSearch('search_vector', term, {
      type: 'websearch',
      config: 'portuguese',
    })
  }

  if (filters.categorySlug) {
    const category = await getCategoryBySlug(filters.categorySlug)
    if (category) {
      const { data: children } = await supabase
        .from('categories')
        .select('id')
        .eq('parent_id', category.id)
      const ids = [category.id, ...(children ?? []).map((c) => c.id)]
      query = query.in('category_id', ids)
    }
  }

  if (filters.minCents != null) query = query.gte('price_cents', filters.minCents)
  if (filters.maxCents != null) query = query.lte('price_cents', filters.maxCents)
  if (filters.tags?.length) query = query.overlaps('tags', filters.tags)
  if (filters.onlyOnSale) query = query.not('compare_at_cents', 'is', null)

  switch (filters.sort) {
    case 'menor-preco':
      query = query.order('price_cents', { ascending: true })
      break
    case 'maior-preco':
      query = query.order('price_cents', { ascending: false })
      break
    case 'novidades':
      query = query.order('created_at', { ascending: false })
      break
    case 'mais-vendidos':
      query = query.order('sales_count', { ascending: false })
      break
    default:
      query = query.order('is_featured', { ascending: false }).order('position')
  }

  const { data, count, error } = await query.range(from, from + perPage - 1)
  logQueryError('searchProducts', error)

  let products = (data as ProductWithImages[]) ?? []

  // Disponibilidade depende de stock_policy, o que o Postgrest não filtra
  // direto. Filtrar aqui é seguro porque a página já está paginada.
  if (filters.onlyAvailable) {
    products = products.filter((p) => {
      const stock = availableStock(p)
      return stock === null || stock > 0
    })
  }

  const total = count ?? 0

  return {
    products,
    total,
    page,
    perPage,
    totalPages: Math.max(Math.ceil(total / perPage), 1),
  }
}

/** Sugestões do autocomplete do header. */
export async function quickSearch(term: string, limit = 6): Promise<ProductWithImages[]> {
  if (!term.trim()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_CARD_FIELDS)
    .eq('status', 'active')
    .ilike('name', `%${term.trim()}%`)
    .order('sales_count', { ascending: false })
    .limit(limit)

  logQueryError('quickSearch', error)
  return (data as ProductWithImages[]) ?? []
}
