'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { sanitizeHtml } from '@/lib/sanitize'
import { createClient } from '@/lib/supabase/server'
import type { Json, SectionType } from '@/lib/types/database.types'

// =============================================================================
// Seções da homepage.
//
// A home não é um arquivo: é uma lista ordenada de seções tipadas no banco. O
// que cada tipo usa muda bastante, então os campos que não pertencem ao tipo
// escolhido são ZERADOS no servidor (normalizeByType). Sem isso, trocar uma
// seção de "collection" para "categories" deixaria um collection_id órfão
// apontando para uma coleção que a home nem lê mais — e que reaparece se
// alguém voltar o tipo meses depois.
//
// O HTML da seção de texto é sanitizado na ESCRITA além da leitura: se um dia
// alguém renderizar esse campo esquecendo o sanitizeHtml(), o banco já não
// guarda <script>.
// =============================================================================

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface SectionActionResult {
  ok: boolean
  error?: string
  id?: string
}

const SECTION_TYPES = [
  'hero',
  'banner',
  'categories',
  'collection',
  'products',
  'text',
  'faq',
  'reviews',
  'cta',
  'features',
] as const

function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Converte "" e "none" (valor do Select vazio) em null antes de validar o uuid. */
function optionalUuid(value: unknown): unknown {
  const normalized = emptyToNull(value)
  return normalized === 'none' ? null : normalized
}

const linkLike = z
  .string()
  .trim()
  .max(2048, 'O endereço é longo demais.')
  .refine(
    (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
    'Use um caminho começando com "/" ou um endereço http(s)://'
  )

const sectionFields = {
  type: z.enum(SECTION_TYPES, 'Escolha um tipo de seção válido.'),

  title: z.preprocess(
    emptyToNull,
    z.string().max(120, 'O título pode ter no máximo 120 caracteres.').nullable()
  ),

  subtitle: z.preprocess(
    emptyToNull,
    z.string().max(240, 'O subtítulo pode ter no máximo 240 caracteres.').nullable()
  ),

  image_url: z.preprocess(emptyToNull, linkLike.nullable()),
  link_url: z.preprocess(emptyToNull, linkLike.nullable()),

  link_label: z.preprocess(
    emptyToNull,
    z.string().max(60, 'O texto do botão pode ter no máximo 60 caracteres.').nullable()
  ),

  collection_id: z.preprocess(optionalUuid, z.uuid('Coleção inválida.').nullable()),
  category_id: z.preprocess(optionalUuid, z.uuid('Categoria inválida.').nullable()),

  // O CHECK do banco é between 1 and 50 — a mensagem sai daqui antes do 23514.
  product_limit: z.coerce
    .number()
    .int('A quantidade precisa ser um número inteiro.')
    .min(1, 'A quantidade mínima é 1.')
    .max(50, 'A quantidade máxima é 50.')
    .default(8),

  is_active: z.boolean().default(true),

  /** Validado por tipo em normalizeConfig(), não aqui. */
  config: z.unknown().optional(),
}

const sectionSchema = z.object(sectionFields)
const createSchema = sectionSchema
const updateSchema = z.object({ id: z.uuid('Seção inválida.'), ...sectionFields })

const idSchema = z.object({ id: z.uuid('Seção inválida.') })

const toggleSchema = z.object({
  id: z.uuid('Seção inválida.'),
  is_active: z.boolean('Informe se a seção fica ativa.'),
})

const reorderSchema = z.object({
  ids: z
    .array(z.uuid('Seção inválida.'))
    .min(1, 'Nada para reordenar.')
    .max(100, 'Reordene no máximo 100 seções por vez.')
    .refine((ids) => new Set(ids).size === ids.length, 'A lista tem seções repetidas.'),
})

export type SectionInput = z.input<typeof sectionSchema>

// ---------------------------------------------------------------------------
// config por tipo
// ---------------------------------------------------------------------------

const featureItemSchema = z.object({
  icon: z.string().trim().max(40, 'Nome de ícone longo demais.').default('Sparkles'),
  title: z
    .string('Cada item precisa de um título.')
    .trim()
    .min(1, 'Cada item precisa de um título.')
    .max(80, 'O título do item pode ter no máximo 80 caracteres.'),
  text: z.string().trim().max(300, 'O texto do item pode ter no máximo 300 caracteres.').default(''),
})

const faqItemSchema = z.object({
  question: z
    .string('Cada pergunta precisa de um texto.')
    .trim()
    .min(3, 'A pergunta precisa de pelo menos 3 caracteres.')
    .max(200, 'A pergunta pode ter no máximo 200 caracteres.'),
  answer: z
    .string('Cada pergunta precisa de uma resposta.')
    .trim()
    .min(1, 'Escreva a resposta.')
    .max(2000, 'A resposta pode ter no máximo 2000 caracteres.'),
})

const featuresConfigSchema = z.object({
  items: z.array(featureItemSchema).max(12, 'No máximo 12 itens.').default([]),
})

const faqConfigSchema = z.object({
  items: z.array(faqItemSchema).max(30, 'No máximo 30 perguntas.').default([]),
})

const textConfigSchema = z.object({
  html: z.string().max(20000, 'O texto pode ter no máximo 20.000 caracteres.').default(''),
})

export interface FeatureItem {
  icon: string
  title: string
  text: string
}
export interface FaqItem {
  question: string
  answer: string
}

type ConfigResult = { ok: true; value: Json } | { ok: false; error: string }

function normalizeConfig(type: SectionType, raw: unknown): ConfigResult {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  if (type === 'features') {
    const parsed = featuresConfigSchema.safeParse(source)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    return { ok: true, value: { items: parsed.data.items } as unknown as Json }
  }

  if (type === 'faq') {
    const parsed = faqConfigSchema.safeParse(source)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    return { ok: true, value: { items: parsed.data.items } as unknown as Json }
  }

  if (type === 'text') {
    const parsed = textConfigSchema.safeParse(source)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    // Sanitiza já na gravação: o banco nunca guarda script.
    return { ok: true, value: { html: sanitizeHtml(parsed.data.html) } as unknown as Json }
  }

  // Os outros tipos não têm payload livre.
  return { ok: true, value: {} as unknown as Json }
}

/**
 * Zera o que não pertence ao tipo. Ver a nota do topo do arquivo: campo de tipo
 * antigo que sobrevive é dado fantasma esperando para confundir alguém.
 */
function normalizeByType(
  type: SectionType,
  data: {
    title: string | null
    subtitle: string | null
    image_url: string | null
    link_url: string | null
    link_label: string | null
    collection_id: string | null
    category_id: string | null
    product_limit: number
  }
) {
  const usesTitle = type !== 'hero' && type !== 'banner'
  const usesSubtitle = ['categories', 'collection', 'products', 'reviews', 'cta'].includes(type)
  const usesCollection = type === 'collection'
  const usesCategory = type === 'products'
  const usesLimit = ['collection', 'products', 'reviews'].includes(type)
  const usesLink = type === 'cta'

  return {
    title: usesTitle ? data.title : null,
    subtitle: usesSubtitle ? data.subtitle : null,
    image_url: type === 'cta' ? data.image_url : null,
    link_url: usesLink ? data.link_url : null,
    link_label: usesLink ? data.link_label : null,
    collection_id: usesCollection ? data.collection_id : null,
    category_id: usesCategory ? data.category_id : null,
    // product_limit tem NOT NULL com CHECK 1..50: manda o default em vez de null.
    product_limit: usesLimit ? data.product_limit : 8,
  }
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  console.error('[homepage]', error)
  return fallback
}

async function logSection(
  supabase: Supabase,
  user: SessionUser,
  action: string,
  entityId: string,
  summary: string,
  metadata: Record<string, Json> = {}
): Promise<void> {
  const { error } = await supabase.rpc('log_admin_action', {
    p_actor_id: user.id,
    p_action: action,
    p_entity_type: 'homepage_section',
    p_entity_id: entityId,
    p_summary: summary,
    p_metadata: metadata,
  })
  if (error) console.error('[homepage:log_admin_action]', error.message)
}

function revalidateHome(): void {
  revalidatePath('/', 'layout')
  revalidatePath('/admin/homepage')
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export async function createSectionAction(input: unknown): Promise<SectionActionResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const config = normalizeConfig(parsed.data.type, parsed.data.config)
  if (!config.ok) return { ok: false, error: config.error }

  try {
    const user = await requirePermission('homepage.write')
    const supabase = await createClient()

    const { data: last } = await supabase
      .from('homepage_sections')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const position = ((last?.position as number | undefined) ?? -1) + 1

    const { data: section, error } = await supabase
      .from('homepage_sections')
      .insert({
        type: parsed.data.type,
        ...normalizeByType(parsed.data.type, parsed.data),
        config: config.value,
        is_active: parsed.data.is_active,
        position,
      })
      .select('id')
      .single()

    if (error || !section) return { ok: false, error: 'Não foi possível criar a seção.' }

    await logSection(
      supabase,
      user,
      'homepage_section.create',
      section.id as string,
      `Seção "${parsed.data.type}" adicionada à home.`,
      { type: parsed.data.type }
    )

    revalidateHome()
    return { ok: true, id: section.id as string }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível criar a seção.') }
  }
}

export async function updateSectionAction(input: unknown): Promise<SectionActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const { id, type, is_active } = parsed.data
  const config = normalizeConfig(type, parsed.data.config)
  if (!config.ok) return { ok: false, error: config.error }

  try {
    const user = await requirePermission('homepage.write')
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('homepage_sections')
      .update({
        type,
        ...normalizeByType(type, parsed.data),
        config: config.value,
        is_active,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: 'Não foi possível salvar a seção.' }
    if (!updated) return { ok: false, error: 'Seção não encontrada.' }

    await logSection(supabase, user, 'homepage_section.update', id, `Seção "${type}" atualizada.`, {
      type,
      is_active,
    })

    revalidateHome()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar a seção.') }
  }
}

export async function toggleSectionActiveAction(input: unknown): Promise<SectionActionResult> {
  const parsed = toggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id, is_active } = parsed.data

  try {
    const user = await requirePermission('homepage.write')
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('homepage_sections')
      .update({ is_active })
      .eq('id', id)
      .select('id, type')
      .maybeSingle()

    if (error) return { ok: false, error: 'Não foi possível alterar a seção.' }
    if (!updated) return { ok: false, error: 'Seção não encontrada.' }

    await logSection(
      supabase,
      user,
      is_active ? 'homepage_section.activate' : 'homepage_section.deactivate',
      id,
      `Seção "${updated.type as string}" ${is_active ? 'ativada' : 'desativada'}.`
    )

    revalidateHome()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível alterar a seção.') }
  }
}

export async function deleteSectionAction(input: unknown): Promise<SectionActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id } = parsed.data

  try {
    // Não existe homepage.delete no enum de permissões: quem edita a home
    // remove seção. A permissão de escrita é a mesma.
    const user = await requirePermission('homepage.write')
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('homepage_sections')
      .select('type')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('homepage_sections').delete().eq('id', id)
    if (error) return { ok: false, error: 'Não foi possível excluir a seção.' }

    await logSection(
      supabase,
      user,
      'homepage_section.delete',
      id,
      `Seção "${(existing?.type as string | undefined) ?? id}" removida da home.`
    )

    revalidateHome()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível excluir a seção.') }
  }
}

/** Salva a ordem de TODAS as seções de uma vez: position = índice na lista. */
export async function reorderSectionsAction(input: unknown): Promise<SectionActionResult> {
  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { ids } = parsed.data

  try {
    const user = await requirePermission('homepage.write')
    const supabase = await createClient()

    const results = await Promise.all(
      ids.map((id, index) =>
        supabase.from('homepage_sections').update({ position: index }).eq('id', id)
      )
    )

    const failed = results.find((result) => result.error)
    if (failed?.error) {
      console.error('[reorderSectionsAction]', failed.error.message)
      return { ok: false, error: 'Não foi possível salvar a nova ordem.' }
    }

    await logSection(
      supabase,
      user,
      'homepage_section.reorder',
      ids[0] as string,
      `${ids.length} seção(ões) reordenada(s).`,
      { ids }
    )

    revalidateHome()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar a nova ordem.') }
  }
}
