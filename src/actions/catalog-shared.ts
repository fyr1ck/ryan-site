import 'server-only'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import type { ProductStatus } from '@/lib/types/database.types'
import { slugify } from '@/lib/utils'

// =============================================================================
// Peças comuns das Server Actions de catálogo (produtos, categorias, coleções).
//
// Este arquivo NÃO tem 'use server': ele é um módulo normal, importado pelos
// arquivos de action. Se levasse a diretiva, cada export teria de ser uma
// função async exposta ao cliente — e um helper de slug não é endpoint.
// =============================================================================

/** Client de servidor com a sessão do admin. O RLS continua valendo. */
export type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Contrato de retorno de toda action deste bloco. */
export interface ActionResult {
  ok: boolean
  error?: string
}

export interface ActionResultWithId extends ActionResult {
  id?: string
}

/**
 * Produto no seletor "adicionar à coleção".
 *
 * O tipo mora aqui, e não no arquivo 'use server', porque um módulo com essa
 * diretiva só deve exportar funções async — e o componente cliente precisa
 * apenas do tipo, que o `import type` apaga na compilação.
 */
export interface CollectionProductOption {
  id: string
  name: string
  slug: string
  price_cents: number
  status: ProductStatus
  image_url: string | null
}

export interface SearchProductsResult extends ActionResult {
  products: CollectionProductOption[]
}

// -----------------------------------------------------------------------------
// Normalização de entrada
// -----------------------------------------------------------------------------

/**
 * Campo de texto opcional: "", "   " e undefined viram null.
 *
 * Coluna opcional no banco guarda NULL, não string vazia — senão
 * `seo_title is null` deixa de encontrar as linhas que o admin esvaziou.
 */
export function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Número opcional: "", null e undefined viram null; string numérica vira number. */
export function toNullableNumber(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}

/** Texto opcional com limite — devolve `string | null`. */
export function nullableText(max: number, label: string) {
  return z.preprocess(
    emptyToNull,
    z
      .string()
      .max(max, `${label} pode ter no máximo ${max} caracteres.`)
      .nullable()
      .optional()
  )
}

/** Valor em centavos opcional (custo, preço "de"). */
export function nullableCents(label: string) {
  return z.preprocess(
    toNullableNumber,
    z
      .number(`${label} inválido.`)
      .int(`${label} precisa ser um valor válido.`)
      .min(0, `${label} não pode ser negativo.`)
      .max(1_000_000_000, `${label} está fora do limite.`)
      .nullable()
      .optional()
  )
}

/** UUID opcional — o Select do formulário manda "" quando é "nenhum". */
export function nullableUuid(message: string) {
  return z.preprocess(emptyToNull, z.uuid(message).nullable().optional())
}

/** Posição na listagem: inteiro pequeno e não negativo. */
export const positionSchema = z.preprocess(
  toNullableNumber,
  z.number('Posição inválida.').int('A posição precisa ser um número inteiro.').min(0).max(100_000).nullable().optional()
)

// -----------------------------------------------------------------------------
// Slug único
// -----------------------------------------------------------------------------

export type SlugTable = 'products' | 'categories' | 'collections'

/**
 * Slug livre para gravar.
 *
 * Lê os slugs que começam com a base e sufixa -2, -3… no primeiro vago. Não é
 * à prova de corrida (duas abas salvando o mesmo nome no mesmo instante ainda
 * batem no índice único), e por isso o 23505 continua traduzido em
 * translateCatalogError() — aqui o objetivo é o caminho normal não incomodar
 * quem só quer cadastrar "Robux 1000" duas vezes.
 */
export async function uniqueSlug(
  supabase: ServerClient,
  table: SlugTable,
  desired: string,
  fallback: string,
  excludeId?: string | null
): Promise<string> {
  const base = slugify(desired) || slugify(fallback) || 'item'

  // slugify só devolve [a-z0-9-]: nenhum caractere curinga de LIKE sobra aqui.
  let query = supabase.from(table).select('slug').like('slug', `${base}%`)
  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query
  const taken = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug))

  if (!taken.has(base)) return base

  for (let suffix = 2; suffix <= 200; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }

  return `${base}-${Date.now().toString(36)}`
}

// -----------------------------------------------------------------------------
// Auditoria
// -----------------------------------------------------------------------------

export interface AdminLogInput {
  actorId: string
  action: string
  entityType: string
  entityId: string | null
  summary: string
}

/**
 * Registra a ação no admin_logs via RPC.
 *
 * A RPC deriva o autor de auth.uid() — o actorId aqui é só para o caso sem
 * sessão. Falha de auditoria NÃO derruba a operação que já foi gravada: o
 * produto está salvo, e devolver erro faria o admin salvar de novo. O que
 * sobra é um console.error para aparecer no log do servidor.
 */
export async function logAdminAction(
  supabase: ServerClient,
  { actorId, action, entityType, entityId, summary }: AdminLogInput
): Promise<void> {
  const { error } = await supabase.rpc('log_admin_action', {
    p_actor_id: actorId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_summary: summary,
  })

  if (error) {
    console.error('[logAdminAction]', action, entityType, entityId, error.message)
  }
}

// -----------------------------------------------------------------------------
// Erros do Postgres em português
// -----------------------------------------------------------------------------

export interface DbErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function uniqueViolationMessage(error: DbErrorLike): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (text.includes('sku')) return 'Já existe um produto com este SKU.'
  if (text.includes('slug')) return 'Já existe um item com este endereço (slug). Ajuste o slug e salve de novo.'
  if (text.includes('short_code')) return 'Conflito ao gerar o código curto. Tente salvar novamente.'
  return 'Já existe um registro com estes dados.'
}

function checkViolationMessage(error: DbErrorLike): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (text.includes('compare_gt_price')) {
    return 'O preço "de" precisa ser maior que o preço de venda.'
  }
  if (text.includes('stock_quantity')) return 'A quantidade em estoque não pode ser negativa.'
  if (text.includes('price_cents')) return 'O preço não pode ser negativo.'
  if (text.includes('no_self_parent')) return 'Uma categoria não pode ser pai dela mesma.'
  return 'Os dados não passaram na validação do banco.'
}

/**
 * Erro do PostgREST → frase que o lojista entende.
 *
 * P0001 é `raise exception` das nossas funções (ciclo de categorias, por
 * exemplo): a mensagem já foi escrita em português, então vai direto.
 */
export function translateCatalogError(error: DbErrorLike, context: string): string {
  const code = error.code ?? ''

  if (code === 'P0001' && error.message) return error.message

  switch (code) {
    case '23505':
      return uniqueViolationMessage(error)
    case '23514':
      return checkViolationMessage(error)
    case '23503':
      return 'Há um vínculo com outro registro que impede esta operação.'
    case '42501':
      return 'Você não tem permissão para esta operação.'
    case '22P02':
      return 'Há um dado inválido no formulário.'
    default:
      break
  }

  console.error(`[${context}:db]`, {
    code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
  return 'Não foi possível concluir a operação. Tente novamente.'
}

/** Mensagem de erro para exceção genérica (inclui a negativa do requirePermission). */
export function failureMessage(error: unknown, context: string): string {
  if (error instanceof Error && error.message) {
    // requirePermission() e as validações lançam mensagens já escritas para
    // o usuário; erro inesperado vira texto genérico e vai para o console.
    if (error.message.startsWith('Sem permissão') || error.message.startsWith('Você precisa')) {
      return error.message
    }
  }
  console.error(`[${context}]`, error)
  return 'Não foi possível concluir a operação. Tente novamente.'
}

/** Lista de tags: apara, remove vazias e duplicadas, preserva a ordem. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, 40)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result.slice(0, 30)
}

/** Ids únicos preservando a ordem que o admin escolheu. */
export function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids))
}
