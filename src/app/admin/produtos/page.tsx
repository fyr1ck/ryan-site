import Link from 'next/link'
import { PackagePlus, ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { ProductStatus, StockPolicy } from '@/lib/types/database.types'

import { ProductsFilters } from './products-filters'
import { ProductsTable, type ProductRow } from './products-table'

export const metadata = { title: 'Produtos' }

const PER_PAGE = 20
const VALID_STATUS: ProductStatus[] = ['draft', 'active', 'archived']

interface ProductQueryRow {
  id: string
  name: string
  slug: string
  sku: string | null
  price_cents: number
  compare_at_cents: number | null
  status: ProductStatus
  stock_policy: StockPolicy
  stock_quantity: number
  stock_reserved: number
  sales_count: number
  product_images: { url: string; position: number }[] | null
}

/** `%` e `_` digitados pelo admin viram literais na busca. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function coverUrl(row: ProductQueryRow): string | null {
  const images = [...(row.product_images ?? [])].sort((a, b) => a.position - b.position)
  return images[0]?.url ?? null
}

/**
 * Rótulo de estoque por política.
 *
 * `digital_keys` NÃO usa stock_quantity — o estoque real é a contagem de
 * chaves com status 'available', que vem numa consulta à parte. Mostrar o
 * número da coluna aqui seria mentir para quem está decidindo repor.
 */
function stockLabel(
  row: ProductQueryRow,
  keysByProduct: Map<string, number>
): { label: string; empty: boolean } {
  if (row.stock_policy === 'unlimited') return { label: 'Ilimitado', empty: false }

  if (row.stock_policy === 'digital_keys') {
    const keys = keysByProduct.get(row.id)
    if (keys === undefined) return { label: 'Chaves digitais', empty: false }
    return { label: `${keys} chave${keys === 1 ? '' : 's'}`, empty: keys === 0 }
  }

  const available = Math.max(row.stock_quantity - row.stock_reserved, 0)
  return { label: `${available} un.`, empty: available === 0 }
}

function buildHref(params: { status: string; q: string; page: number }): string {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.q) query.set('q', params.q)
  if (params.page > 1) query.set('page', String(params.page))
  const text = query.toString()
  return text ? `/admin/produtos?${text}` : '/admin/produtos'
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  const user = await getSessionUser()

  if (!can(user, 'products.read')) {
    return (
      <>
        <PageHeader title="Produtos" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não tem acesso ao catálogo"
          description="Peça a um super admin a permissão products.read."
        />
      </>
    )
  }

  const status = VALID_STATUS.includes(params.status as ProductStatus) ? (params.status as string) : ''
  const search = (params.q ?? '').trim().slice(0, 120)
  const page = Math.max(Number.parseInt(params.page ?? '1', 10) || 1, 1)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select(
      `id, name, slug, sku, price_cents, compare_at_cents, status, stock_policy,
       stock_quantity, stock_reserved, sales_count, product_images (url, position)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('name', `%${escapeLike(search)}%`)

  const { data, count } = await query
  const products = (data ?? []) as ProductQueryRow[]

  // Estoque das chaves digitais só desta página — uma consulta, não uma por linha.
  const digitalIds = products
    .filter((product) => product.stock_policy === 'digital_keys')
    .map((product) => product.id)

  const keysByProduct = new Map<string, number>()
  if (digitalIds.length > 0) {
    const { data: keys } = await supabase
      .from('digital_stock_items')
      .select('product_id')
      .eq('status', 'available')
      .in('product_id', digitalIds)
      .limit(10_000)

    // Sem inventory.read o RLS devolve vazio: nesse caso o rótulo cai para
    // "Chaves digitais", em vez de anunciar um zero que não é verdade.
    if (keys) {
      for (const id of digitalIds) keysByProduct.set(id, 0)
      for (const row of keys as { product_id: string }[]) {
        keysByProduct.set(row.product_id, (keysByProduct.get(row.product_id) ?? 0) + 1)
      }
    }
  }

  const rows: ProductRow[] = products.map((product) => {
    const stock = stockLabel(product, keysByProduct)
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      price_cents: product.price_cents,
      compare_at_cents: product.compare_at_cents,
      status: product.status,
      stock_label: stock.label,
      out_of_stock: stock.empty,
      sales_count: product.sales_count,
      image_url: coverUrl(product),
    }
  })

  const total = count ?? 0
  const totalPages = Math.max(Math.ceil(total / PER_PAGE), 1)
  const canWrite = can(user, 'products.write')
  const canDelete = can(user, 'products.delete')

  return (
    <>
      <PageHeader
        title="Produtos"
        description={
          total === 0
            ? 'Cadastre o que a sua loja vende.'
            : `${total.toLocaleString('pt-BR')} produto(s) no catálogo.`
        }
      >
        {canWrite && (
          <Button asChild size="sm">
            <Link href="/admin/produtos/novo">
              <PackagePlus />
              Novo produto
            </Link>
          </Button>
        )}
      </PageHeader>

      <ProductsFilters status={status} search={search} />

      <ProductsTable rows={rows} canWrite={canWrite} canDelete={canDelete} />

      {totalPages > 1 && (
        <nav
          aria-label="Paginação dos produtos"
          className="mt-4 flex items-center justify-between gap-3"
        >
          <Button asChild variant="outline" size="sm">
            <Link
              href={buildHref({ status, q: search, page: page - 1 })}
              aria-disabled={page <= 1}
              className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
            >
              Anterior
            </Link>
          </Button>

          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>

          <Button asChild variant="outline" size="sm">
            <Link
              href={buildHref({ status, q: search, page: page + 1 })}
              aria-disabled={page >= totalPages}
              className={page >= totalPages ? 'pointer-events-none opacity-50' : undefined}
            >
              Próxima
            </Link>
          </Button>
        </nav>
      )}
    </>
  )
}
