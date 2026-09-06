import type { Metadata } from 'next'
import { Boxes, CheckCircle2, Clock } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { StatCard } from '@/components/admin/stat-card'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { DigitalContentType, StockItemStatus, StockPolicy } from '@/lib/types/database.types'

import { AdminPagination } from '../admin-pagination'
import { PermissionNotice } from '../permission-notice'
import { maskSecret } from '../secret-mask'
import { StockManager, type StockItemView, type StockProductOption } from './stock-manager'

export const metadata: Metadata = { title: 'Estoque' }

const PER_PAGE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CONTENT_TYPE_LABEL: Record<DigitalContentType, string> = {
  code: 'Código',
  link: 'Link',
  file: 'Arquivo',
  credential: 'Credencial',
  text: 'Texto',
}

interface PageProps {
  searchParams: Promise<{ produto?: string; pagina?: string }>
}

interface ProductRow {
  id: string
  name: string
  stock_policy: StockPolicy
  stock_quantity: number
  stock_reserved: number
}

interface StockRow {
  id: string
  content: string
  content_type: DigitalContentType
  status: StockItemStatus
  note: string | null
  created_at: string
}

function parsePage(value: string | undefined): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export default async function AdminStockPage({ searchParams }: PageProps) {
  const { produto, pagina } = await searchParams

  const user = await getSessionUser()
  if (!can(user, 'inventory.read')) {
    return (
      <>
        <PageHeader title="Estoque" />
        <PermissionNotice permission="inventory.read" what="o estoque digital" />
      </>
    )
  }

  const productId = produto && UUID_RE.test(produto) ? produto : null
  const page = parsePage(pagina)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()

  // Produtos de estoque controlado. `unlimited` fica de fora: não há o que
  // gerir num produto que nunca acaba.
  const { data: productsRaw } = await supabase
    .from('products')
    .select('id, name, stock_policy, stock_quantity, stock_reserved')
    .in('stock_policy', ['digital_keys', 'manual'])
    .order('name', { ascending: true })
    .limit(300)

  const products = (productsRaw ?? []) as unknown as ProductRow[]

  function scopedCount(status: StockItemStatus) {
    let query = supabase
      .from('digital_stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    if (productId) query = query.eq('product_id', productId)
    return query
  }

  let itemsQuery = supabase
    .from('digital_stock_items')
    .select('id, content, content_type, status, note, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (productId) itemsQuery = itemsQuery.eq('product_id', productId)

  const [availableRes, reservedRes, deliveredRes, itemsRes] = await Promise.all([
    scopedCount('available'),
    scopedCount('reserved'),
    scopedCount('delivered'),
    itemsQuery,
  ])

  if (itemsRes.error) console.error('[AdminStockPage]', itemsRes.error)

  // ---------------------------------------------------------------------------
  // A MÁSCARA É FEITA AQUI. `content` não sai desta função: o navegador recebe
  // "DEMO-••••-3" e só consegue o valor real chamando revealStockItemAction(),
  // que registra quem olhou. Mandar a lista inteira de chaves para o cliente
  // seria entregar o cofre e trancar a porta.
  // ---------------------------------------------------------------------------
  const items: StockItemView[] = ((itemsRes.data ?? []) as unknown as StockRow[]).map((item) => ({
    id: item.id,
    masked: maskSecret(item.content),
    contentTypeLabel: CONTENT_TYPE_LABEL[item.content_type] ?? 'Texto',
    status: item.status,
    note: item.note,
    createdAt: item.created_at,
  }))

  const options: StockProductOption[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    stockPolicy: product.stock_policy as StockProductOption['stockPolicy'],
    stockQuantity: product.stock_quantity,
    stockReserved: product.stock_reserved,
  }))

  const total = itemsRes.count ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const selectedName = options.find((option) => option.id === productId)?.name

  return (
    <>
      <PageHeader
        title="Estoque digital"
        description={
          selectedName
            ? `Chaves de "${selectedName}".`
            : 'Chaves, credenciais e links vendidos pela loja. O conteúdo nunca aparece inteiro nesta lista.'
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Disponíveis"
          value={availableRes.count ?? 0}
          icon={<Boxes />}
          hint="prontas para vender"
        />
        <StatCard
          label="Reservadas"
          value={reservedRes.count ?? 0}
          icon={<Clock />}
          hint="presas a pedidos em aberto"
        />
        <StatCard
          label="Entregues"
          value={deliveredRes.count ?? 0}
          icon={<CheckCircle2 />}
          hint="já foram para o cliente"
        />
      </div>

      <StockManager
        products={options}
        selectedId={productId}
        items={items}
        canWrite={can(user, 'inventory.write')}
      />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/estoque"
        params={{ produto: productId ?? undefined }}
        itemLabel="chaves"
      />
    </>
  )
}
