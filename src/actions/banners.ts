'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/database.types'

// =============================================================================
// Banners do CMS.
//
// Escrita sempre pelo client de SERVIDOR com a sessão do admin (nunca o
// service_role): assim a policy `banners_admin_write` continua sendo a última
// palavra mesmo que um bug deixe passar uma chamada sem requirePermission.
//
// Datas: o formulário manda ISO 8601 em UTC (o <input type="datetime-local">
// é convertido no cliente, onde o fuso do admin é conhecido). Converter aqui
// no servidor gravaria a hora errada sempre que o servidor rodasse em UTC e o
// admin estivesse em São Paulo.
// =============================================================================

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface BannerActionResult {
  ok: boolean
  error?: string
  id?: string
}

/** "" e espaços em branco viram null — coluna opcional guarda null, não "". */
function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Caminho interno (/promo) ou URL absoluta http(s). Barra o `javascript:` e o
 * `data:` que virariam XSS no href do banner, que é clicável por qualquer
 * visitante.
 */
const linkLike = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'O endereço é longo demais.')
    .refine(
      (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
      'Use um caminho começando com "/" ou um endereço http(s)://'
    )

/**
 * Aceita qualquer string que o JS entenda como data e normaliza para ISO/UTC.
 * Feito na mão em vez de z.iso.datetime() para não depender da API de formato
 * de uma versão específica do zod.
 */
const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
  .transform((value) => new Date(value).toISOString())

const bannerFields = {
  title: z
    .string('Informe o título.')
    .trim()
    .min(2, 'O título precisa de pelo menos 2 caracteres.')
    .max(120, 'O título pode ter no máximo 120 caracteres.'),

  placement: z.enum(
    ['home_hero', 'home_middle', 'category_top', 'sidebar'],
    'Escolha um posicionamento válido.'
  ),

  image_url: linkLike(2048),

  image_mobile_url: z.preprocess(emptyToNull, linkLike(2048).nullable()),

  alt: z.preprocess(
    emptyToNull,
    z.string().max(200, 'O texto alternativo pode ter no máximo 200 caracteres.').nullable()
  ),

  link_url: z.preprocess(emptyToNull, linkLike(2048).nullable()),

  open_in_new_tab: z.boolean().default(false),

  starts_at: z.preprocess(emptyToNull, isoDateTime.nullable()),
  ends_at: z.preprocess(emptyToNull, isoDateTime.nullable()),

  is_active: z.boolean().default(true),
}

const bannerFieldsSchema = z.object(bannerFields)

/** Espelha o CHECK banners_window_valid do banco: erro legível antes do 23514. */
function windowIsValid(data: { starts_at: string | null; ends_at: string | null }): boolean {
  if (!data.starts_at || !data.ends_at) return true
  return new Date(data.ends_at) > new Date(data.starts_at)
}

const WINDOW_ERROR = {
  message: 'A data de fim precisa ser depois da data de início.',
  path: ['ends_at'],
}

const createSchema = bannerFieldsSchema.refine(windowIsValid, WINDOW_ERROR)

const updateSchema = z
  .object({ id: z.uuid('Banner inválido.'), ...bannerFields })
  .refine(windowIsValid, WINDOW_ERROR)

const idSchema = z.object({ id: z.uuid('Banner inválido.') })

const toggleSchema = z.object({
  id: z.uuid('Banner inválido.'),
  is_active: z.boolean('Informe se o banner fica ativo.'),
})

const reorderSchema = z.object({
  ids: z
    .array(z.uuid('Banner inválido.'))
    .min(1, 'Nada para reordenar.')
    .max(200, 'Reordene no máximo 200 banners por vez.')
    .refine((ids) => new Set(ids).size === ids.length, 'A lista tem banners repetidos.'),
})

export type BannerInput = z.input<typeof bannerFieldsSchema>

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

/** Erro de requirePermission já vem legível; o resto vira mensagem genérica. */
function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  console.error('[banners]', error)
  return fallback
}

/**
 * Auditoria. Falha de log NUNCA derruba a operação — o banner já foi salvo, e
 * devolver erro faria o admin repetir a ação e duplicar o registro.
 */
async function logBanner(
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
    p_entity_type: 'banner',
    p_entity_id: entityId,
    p_summary: summary,
    p_metadata: metadata,
  })
  if (error) console.error('[banners:log_admin_action]', error.message)
}

function revalidateBanners(): void {
  // 'layout' porque banner aparece na home E no topo de categoria; revalidar só
  // '/' deixaria a categoria servindo a arte antiga.
  revalidatePath('/', 'layout')
  revalidatePath('/admin/banners')
}

export async function createBannerAction(input: unknown): Promise<BannerActionResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const data = parsed.data

  try {
    const user = await requirePermission('banners.write')
    const supabase = await createClient()

    // Entra no fim da fila do próprio posicionamento.
    const { data: last } = await supabase
      .from('banners')
      .select('position')
      .eq('placement', data.placement)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const position = ((last?.position as number | undefined) ?? -1) + 1

    const { data: banner, error } = await supabase
      .from('banners')
      .insert({ ...data, position })
      .select('id')
      .single()

    if (error || !banner) {
      return { ok: false, error: 'Não foi possível criar o banner.' }
    }

    await logBanner(supabase, user, 'banner.create', banner.id as string, `Banner "${data.title}" criado.`, {
      placement: data.placement,
      is_active: data.is_active,
    })

    revalidateBanners()
    return { ok: true, id: banner.id as string }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível criar o banner.') }
  }
}

export async function updateBannerAction(input: unknown): Promise<BannerActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id, ...data } = parsed.data

  try {
    const user = await requirePermission('banners.write')
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('banners')
      .update(data)
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: 'Não foi possível salvar o banner.' }
    if (!updated) return { ok: false, error: 'Banner não encontrado.' }

    await logBanner(supabase, user, 'banner.update', id, `Banner "${data.title}" atualizado.`, {
      placement: data.placement,
      is_active: data.is_active,
    })

    revalidateBanners()
    revalidatePath(`/admin/banners/${id}`)
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar o banner.') }
  }
}

export async function toggleBannerActiveAction(input: unknown): Promise<BannerActionResult> {
  const parsed = toggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id, is_active } = parsed.data

  try {
    const user = await requirePermission('banners.write')
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('banners')
      .update({ is_active })
      .eq('id', id)
      .select('id, title')
      .maybeSingle()

    if (error) return { ok: false, error: 'Não foi possível alterar o banner.' }
    if (!updated) return { ok: false, error: 'Banner não encontrado.' }

    await logBanner(
      supabase,
      user,
      is_active ? 'banner.activate' : 'banner.deactivate',
      id,
      `Banner "${updated.title as string}" ${is_active ? 'ativado' : 'desativado'}.`
    )

    revalidateBanners()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível alterar o banner.') }
  }
}

export async function deleteBannerAction(input: unknown): Promise<BannerActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id } = parsed.data

  try {
    const user = await requirePermission('banners.delete')
    const supabase = await createClient()

    // Lê antes de apagar só para o log ter o nome — depois do delete não há de onde tirar.
    const { data: existing } = await supabase.from('banners').select('title').eq('id', id).maybeSingle()

    const { error } = await supabase.from('banners').delete().eq('id', id)
    if (error) return { ok: false, error: 'Não foi possível excluir o banner.' }

    await logBanner(
      supabase,
      user,
      'banner.delete',
      id,
      `Banner "${(existing?.title as string | undefined) ?? id}" excluído.`
    )

    revalidateBanners()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível excluir o banner.') }
  }
}

/**
 * Reordena um grupo inteiro: a posição de cada banner passa a ser o índice dele
 * na lista recebida. O cliente manda os ids de UM posicionamento por vez, que é
 * como o índice (placement, position) é lido na vitrine.
 */
export async function reorderBannersAction(input: unknown): Promise<BannerActionResult> {
  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { ids } = parsed.data

  try {
    const user = await requirePermission('banners.write')
    const supabase = await createClient()

    const results = await Promise.all(
      ids.map((id, index) => supabase.from('banners').update({ position: index }).eq('id', id))
    )

    const failed = results.find((result) => result.error)
    if (failed?.error) {
      console.error('[reorderBannersAction]', failed.error.message)
      return { ok: false, error: 'Não foi possível salvar a nova ordem.' }
    }

    await logBanner(supabase, user, 'banner.reorder', ids[0] as string, `${ids.length} banner(s) reordenado(s).`, {
      ids,
    })

    revalidateBanners()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar a nova ordem.') }
  }
}
