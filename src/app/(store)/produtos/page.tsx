import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { ProductGrid } from '@/components/store/product-grid'
import {
  ProductFiltersPanel,
  ProductFiltersSheet,
  ProductToolbar,
  type FilterCategoryNode,
  type ParamEntry,
  type ProductFilterValues,
} from '@/components/store/product-filters'
import { SORT_VALUES } from '@/lib/catalog-options'
import { Button } from '@/components/ui/button'
import {
  getCategories,
  getCollectionBySlug,
  searchProducts,
  type SortOption,
} from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/settings'
import { buildMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, parsePriceToCents } from '@/lib/utils'

/**
 * Listagem do catálogo.
 *
 * Todo o estado (busca, filtros, ordenação, página) vem da URL e nada é
 * guardado em memória: o link é compartilhável, o botão voltar desfaz um
 * passo por vez e a página inteira continua sendo Server Component — só o
 * form de filtros é ilha de cliente.
 */

type RawSearchParams = Record<string, string | string[] | undefined>

const PER_PAGE = 24

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

/** Aceita `tags=a&tags=b` e `tags=a,b` — o form manda o primeiro formato. */
function listValue(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  const seen = new Set<string>()
  for (const item of raw) {
    for (const piece of item.split(',')) {
      const clean = piece.trim()
      if (clean) seen.add(clean)
    }
  }
  return [...seen]
}

function isOn(value: string | string[] | undefined): boolean {
  const flag = firstValue(value).toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on' || flag === 'sim'
}

interface ParsedParams {
  q: string
  categoria: string
  colecao: string
  min: string
  max: string
  tags: string[]
  disponiveis: boolean
  promocao: boolean
  ordem: SortOption
  pagina: number
}

function parseParams(raw: RawSearchParams): ParsedParams {
  const ordem = firstValue(raw.ordem)
  const pagina = Number.parseInt(firstValue(raw.pagina), 10)

  return {
    q: firstValue(raw.q),
    categoria: firstValue(raw.categoria),
    colecao: firstValue(raw.colecao),
    min: firstValue(raw.min),
    max: firstValue(raw.max),
    tags: listValue(raw.tags),
    disponiveis: isOn(raw.disponiveis),
    promocao: isOn(raw.promocao),
    ordem: (SORT_VALUES.includes(ordem) ? ordem : 'relevancia') as SortOption,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  }
}

/**
 * Reconstrói a querystring a partir do que foi realmente entendido.
 *
 * Quem digita `?ordem=xablau&pagina=-3` na barra de endereços não deve
 * contaminar os links de paginação e dos chips: eles saem daqui, já limpos.
 */
function toEntries(parsed: ParsedParams): ParamEntry[] {
  const entries: ParamEntry[] = []
  if (parsed.q) entries.push(['q', parsed.q])
  if (parsed.categoria) entries.push(['categoria', parsed.categoria])
  if (parsed.colecao) entries.push(['colecao', parsed.colecao])
  if (parsed.min) entries.push(['min', parsed.min])
  if (parsed.max) entries.push(['max', parsed.max])
  for (const tag of parsed.tags) entries.push(['tags', tag])
  if (parsed.disponiveis) entries.push(['disponiveis', '1'])
  if (parsed.promocao) entries.push(['promocao', '1'])
  if (parsed.ordem !== 'relevancia') entries.push(['ordem', parsed.ordem])
  if (parsed.pagina > 1) entries.push(['pagina', String(parsed.pagina)])
  return entries
}

function hrefFrom(entries: ParamEntry[]): string {
  const query = new URLSearchParams(entries).toString()
  return query ? `/produtos?${query}` : '/produtos'
}

/** Link do chip "remover filtro": tira a chave (ou só um valor dela) e volta para a página 1. */
function hrefWithout(entries: ParamEntry[], key: string, value?: string): string {
  return hrefFrom(
    entries.filter(([entryKey, entryValue]) => {
      if (entryKey === 'pagina') return false
      if (entryKey !== key) return true
      return value !== undefined && entryValue !== value
    })
  )
}

function hrefForPage(entries: ParamEntry[], page: number): string {
  const rest = entries.filter(([key]) => key !== 'pagina')
  return hrefFrom(page > 1 ? [...rest, ['pagina', String(page)]] : rest)
}

/**
 * Tags disponíveis no filtro.
 *
 * Vem de uma consulta própria, e não das tags dos produtos desta página, para
 * a lista não mudar a cada filtro aplicado — uma tag que some do painel no
 * momento em que você a marca é um beco sem saída. RLS já esconde rascunho.
 */
const getFilterTags = cache(async (): Promise<string[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('tags')
    .eq('status', 'active')
    .limit(500)

  const counts = new Map<string, number>()
  for (const row of (data as { tags: string[] | null }[]) ?? []) {
    for (const tag of row.tags ?? []) {
      const clean = tag.trim()
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, 24)
    .map(([tag]) => tag)
})

/** Categorias em dois níveis: pai com as filhas logo abaixo. */
function toTree(
  categories: { id: string; name: string; slug: string; parent_id: string | null }[]
): FilterCategoryNode[] {
  return categories
    .filter((category) => category.parent_id === null)
    .map((parent) => ({
      id: parent.id,
      name: parent.name,
      slug: parent.slug,
      children: categories
        .filter((child) => child.parent_id === parent.id)
        .map((child) => ({ id: child.id, name: child.name, slug: child.slug })),
    }))
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}): Promise<Metadata> {
  const parsed = parseParams(await searchParams)
  const settings = await getStoreSettings()

  const title = parsed.q
    ? `Busca por “${parsed.q}” — ${settings.store_name}`
    : parsed.pagina > 1
      ? `Catálogo — página ${parsed.pagina} — ${settings.store_name}`
      : `Todos os produtos — ${settings.store_name}`

  const description = parsed.q
    ? `Resultados para “${parsed.q}” em ${settings.store_name}. Entrega imediata e pagamento via Pix.`
    : settings.store_description ||
      `Catálogo completo da ${settings.store_name}: entrega imediata e pagamento via Pix.`

  return buildMetadata({
    title,
    description,
    image: settings.seo_og_image,
    path: parsed.pagina > 1 ? `/produtos?pagina=${parsed.pagina}` : '/produtos',
    // Página de resultado de busca não entra no índice: gera infinitas URLs
    // com o mesmo conteúdo e canibaliza as páginas de categoria.
    noIndex: Boolean(parsed.q),
  })
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const parsed = parseParams(await searchParams)
  const entries = toEntries(parsed)

  const [categories, tags, result, collection] = await Promise.all([
    getCategories(),
    getFilterTags(),
    searchProducts({
      search: parsed.q || undefined,
      categorySlug: parsed.categoria || undefined,
      collectionSlug: parsed.colecao || undefined,
      minCents: parsed.min ? parsePriceToCents(parsed.min) : undefined,
      maxCents: parsed.max ? parsePriceToCents(parsed.max) : undefined,
      tags: parsed.tags.length > 0 ? parsed.tags : undefined,
      onlyAvailable: parsed.disponiveis,
      onlyOnSale: parsed.promocao,
      sort: parsed.ordem,
      page: parsed.pagina,
      perPage: PER_PAGE,
    }),
    parsed.colecao ? getCollectionBySlug(parsed.colecao) : Promise.resolve(null),
  ])

  const tree = toTree(categories)
  const activeCategory = categories.find((category) => category.slug === parsed.categoria) ?? null

  const values: ProductFilterValues = {
    categoria: parsed.categoria,
    min: parsed.min,
    max: parsed.max,
    tags: parsed.tags,
    disponiveis: parsed.disponiveis,
    promocao: parsed.promocao,
  }

  // Cada form GET carrega os parâmetros que ele mesmo não controla, senão
  // buscar apagaria os filtros e filtrar apagaria a busca.
  const preservedForFilters = entries.filter(([key]) => key === 'q' || key === 'ordem')
  const preservedForToolbar = entries.filter(
    ([key]) => key !== 'q' && key !== 'ordem' && key !== 'pagina'
  )

  const activeChips: { key: string; label: string; href: string }[] = []
  if (activeCategory) {
    activeChips.push({
      key: 'categoria',
      label: activeCategory.name,
      href: hrefWithout(entries, 'categoria'),
    })
  }
  if (parsed.colecao) {
    activeChips.push({
      key: 'colecao',
      label: collection?.name ?? parsed.colecao,
      href: hrefWithout(entries, 'colecao'),
    })
  }
  if (parsed.min || parsed.max) {
    const from = parsed.min ? formatPrice(parsePriceToCents(parsed.min)) : null
    const to = parsed.max ? formatPrice(parsePriceToCents(parsed.max)) : null
    const label = from && to ? `${from} a ${to}` : from ? `A partir de ${from}` : `Até ${to}`
    activeChips.push({
      key: 'preco',
      label,
      href: hrefFrom(
        entries.filter(([key]) => key !== 'min' && key !== 'max' && key !== 'pagina')
      ),
    })
  }
  if (parsed.disponiveis) {
    activeChips.push({
      key: 'disponiveis',
      label: 'Somente disponíveis',
      href: hrefWithout(entries, 'disponiveis'),
    })
  }
  if (parsed.promocao) {
    activeChips.push({
      key: 'promocao',
      label: 'Somente em promoção',
      href: hrefWithout(entries, 'promocao'),
    })
  }
  for (const tag of parsed.tags) {
    activeChips.push({
      key: `tag-${tag}`,
      label: tag,
      href: hrefWithout(entries, 'tags', tag),
    })
  }

  const heading = parsed.q ? `Resultados para “${parsed.q}”` : 'Todos os produtos'
  const countLabel =
    result.total === 1 ? '1 produto encontrado' : `${result.total} produtos encontrados`

  return (
    <div className="container-store flex flex-col gap-5 py-5 lg:gap-6 lg:py-8">
      <div className="flex flex-col gap-2">
        <Breadcrumbs items={[{ label: 'Produtos' }]} />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold sm:text-2xl">{heading}</h1>
          <p className="text-sm text-muted-foreground">{countLabel}</p>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <ProductToolbar
          q={parsed.q}
          ordem={parsed.ordem}
          preserved={preservedForToolbar}
          className="min-w-0 flex-1"
        />
        <ProductFiltersSheet
          className="lg:hidden"
          categories={tree}
          tags={tags}
          values={values}
          preserved={preservedForFilters}
          activeCount={activeChips.length}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-bold">Filtros</h2>
            <ProductFiltersPanel
              categories={tree}
              tags={tags}
              values={values}
              preserved={preservedForFilters}
              autoSubmit
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {activeChips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1.5">
              {activeChips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.href}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:text-foreground"
                  >
                    {chip.label}
                    <X className="size-3" aria-hidden />
                    <span className="sr-only">Remover filtro</span>
                  </Link>
                </li>
              ))}
              <li>
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Link href={hrefFrom(preservedForFilters)}>
                    <RotateCcw aria-hidden />
                    Limpar
                  </Link>
                </Button>
              </li>
            </ul>
          )}

          <ProductGrid
            products={result.products}
            emptyMessage={
              parsed.q
                ? `Nada encontrado para “${parsed.q}”. Tente outra palavra ou remova os filtros.`
                : 'Nenhum produto atende a esses filtros. Tente afrouxar a faixa de preço.'
            }
          />

          <Pagination entries={entries} page={result.page} totalPages={result.totalPages} />
        </div>
      </div>
    </div>
  )
}

/** Janela de páginas com reticências: 1 … 4 5 6 … 20 */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  const pages: (number | 'gap')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2) pages.push('gap')
  for (let page = start; page <= end; page += 1) pages.push(page)
  if (end < total - 1) pages.push('gap')
  pages.push(total)

  return pages
}

function Pagination({
  entries,
  page,
  totalPages,
}: {
  entries: ParamEntry[]
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null

  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <nav aria-label="Paginação do catálogo" className="flex justify-center pt-2">
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {hasPrev ? (
            <Button asChild variant="outline" size="icon-sm">
              <Link href={hrefForPage(entries, page - 1)} rel="prev" aria-label="Página anterior">
                <ChevronLeft />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Página anterior">
              <ChevronLeft />
            </Button>
          )}
        </li>

        {pageWindow(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="px-1 text-sm text-muted-foreground"
            >
              …
            </li>
          ) : (
            <li key={item}>
              <Button
                asChild
                variant={item === page ? 'default' : 'outline'}
                size="icon-sm"
                className="tabular-nums"
              >
                <Link
                  href={hrefForPage(entries, item)}
                  aria-label={`Página ${item}`}
                  aria-current={item === page ? 'page' : undefined}
                >
                  {item}
                </Link>
              </Button>
            </li>
          )
        )}

        <li>
          {hasNext ? (
            <Button asChild variant="outline" size="icon-sm">
              <Link href={hrefForPage(entries, page + 1)} rel="next" aria-label="Próxima página">
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Próxima página">
              <ChevronRight />
            </Button>
          )}
        </li>
      </ul>
    </nav>
  )
}
