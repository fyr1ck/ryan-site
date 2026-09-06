import type { Metadata } from 'next'
import { Lock } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { AdminPagination } from '../admin-pagination'
import { PermissionNotice } from '../permission-notice'
import { LogFilters } from './log-filters'
import { LogsTable, type AdminLogRow } from './logs-table'

export const metadata: Metadata = { title: 'Logs' }

const PER_PAGE = 50
const DAY_MS = 86_400_000

/** Quantas linhas recentes alimentam os selects de filtro. */
const FACET_SAMPLE = 1000

const ENTITY_LABEL: Record<string, string> = {
  order: 'Pedido',
  review: 'Avaliação',
  coupon: 'Cupom',
  digital_stock: 'Estoque',
  admin_access: 'Acesso',
  product: 'Produto',
  category: 'Categoria',
  collection: 'Coleção',
  banner: 'Banner',
  page: 'Página',
  setting: 'Configuração',
}

interface PageProps {
  searchParams: Promise<{
    admin?: string
    entidade?: string
    periodo?: string
    pagina?: string
  }>
}

function parsePage(value: string | undefined): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function cutoffFor(period: string): string | null {
  if (period === 'tudo') return null
  const days = Number(period)
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

export default async function AdminLogsPage({ searchParams }: PageProps) {
  const { admin, entidade, periodo, pagina } = await searchParams

  const user = await getSessionUser()
  if (!can(user, 'logs.read')) {
    return (
      <>
        <PageHeader title="Logs" />
        <PermissionNotice permission="logs.read" what="a auditoria" />
      </>
    )
  }

  const period = periodo === '7' || periodo === '90' || periodo === 'tudo' ? periodo : '30'
  const page = parsePage(pagina)
  const from = (page - 1) * PER_PAGE
  const cutoff = cutoffFor(period)

  const supabase = await createClient()

  let query = supabase
    .from('admin_logs')
    .select('id, created_at, actor_email, action, entity_type, entity_id, summary', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (cutoff) query = query.gte('created_at', cutoff)
  if (admin) query = query.eq('actor_email', admin)
  if (entidade) query = query.eq('entity_type', entidade)

  // As opções dos filtros saem de uma amostra recente. Postgres não tem
  // "select distinct" pelo PostgREST, e criar uma view só para isso seria mais
  // máquina do que o problema pede: o que importa é oferecer os nomes que
  // realmente aparecem no período recente.
  const [{ data, count, error }, { data: facetRaw }] = await Promise.all([
    query,
    supabase
      .from('admin_logs')
      .select('actor_email, entity_type')
      .order('created_at', { ascending: false })
      .limit(FACET_SAMPLE),
  ])

  if (error) console.error('[AdminLogsPage]', error)

  const rows = (data ?? []) as unknown as AdminLogRow[]

  const facets = (facetRaw ?? []) as { actor_email: string | null; entity_type: string | null }[]
  const admins = Array.from(
    new Set(facets.map((row) => row.actor_email).filter((value): value is string => !!value))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const entities = Array.from(
    new Set(facets.map((row) => row.entity_type).filter((value): value is string => !!value))
  )
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((value) => ({ value, label: ENTITY_LABEL[value] ?? value }))

  const total = count ?? rows.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <PageHeader
        title="Logs de auditoria"
        description="Toda ação administrativa que muda dados deixa registro aqui, com autor, alvo e resumo."
      >
        <Badge variant="muted">
          <Lock className="size-3" />
          Somente leitura
        </Badge>
      </PageHeader>

      <LogFilters
        admins={admins}
        entities={entities}
        admin={admin}
        entity={entidade}
        period={period}
      />

      <LogsTable rows={rows} />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/logs"
        params={{
          admin,
          entidade,
          periodo: period === '30' ? undefined : period,
        }}
        itemLabel="registros"
      />

      <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
        Não existe editar nem excluir log: a tabela <code className="font-mono">admin_logs</code> é
        append-only por design, sem policy de UPDATE ou DELETE no banco. Um registro que pudesse ser
        apagado não serviria como auditoria.
      </p>
    </>
  )
}
