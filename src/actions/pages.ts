'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { sanitizeHtml } from '@/lib/sanitize'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import type { Json } from '@/lib/types/database.types'

// =============================================================================
// Páginas de conteúdo (termos, política, sobre…).
//
// O `content` é HTML escrito no painel e sai em dangerouslySetInnerHTML na
// vitrine. Ele é sanitizado DUAS vezes de propósito: aqui, na gravação, e de
// novo na leitura. A gravação impede que um <script> chegue a existir no banco;
// a leitura protege as linhas que já estavam lá antes desta regra.
// =============================================================================

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface PageActionResult {
  ok: boolean
  error?: string
  id?: string
  slug?: string
}

function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const pageFields = {
  title: z
    .string('Informe o título.')
    .trim()
    .min(2, 'O título precisa de pelo menos 2 caracteres.')
    .max(160, 'O título pode ter no máximo 160 caracteres.'),

  // slugify() antes de validar: o admin pode digitar "Política de Troca" e
  // ainda assim gravar "politica-de-troca".
  slug: z
    .string('Informe o endereço da página.')
    .transform((value) => slugify(value))
    .refine((value) => value.length >= 2, 'O endereço precisa de pelo menos 2 caracteres.')
    .refine((value) => value.length <= 120, 'O endereço pode ter no máximo 120 caracteres.')
    .refine((value) => SLUG_PATTERN.test(value), 'Use apenas letras, números e hífen.'),

  content: z.preprocess(
    emptyToNull,
    z.string().max(200000, 'O conteúdo passou do limite de 200.000 caracteres.').nullable()
  ),

  excerpt: z.preprocess(
    emptyToNull,
    z.string().max(300, 'O resumo pode ter no máximo 300 caracteres.').nullable()
  ),

  seo_title: z.preprocess(
    emptyToNull,
    z.string().max(70, 'O título SEO pode ter no máximo 70 caracteres.').nullable()
  ),

  seo_description: z.preprocess(
    emptyToNull,
    z.string().max(180, 'A descrição SEO pode ter no máximo 180 caracteres.').nullable()
  ),

  is_published: z.boolean().default(false),
  show_in_footer: z.boolean().default(false),

  position: z.coerce
    .number()
    .int('A posição precisa ser um número inteiro.')
    .min(0, 'A posição não pode ser negativa.')
    .max(9999, 'A posição máxima é 9999.')
    .default(0),
}

const pageSchema = z.object(pageFields)
const createSchema = pageSchema
const updateSchema = z.object({ id: z.uuid('Página inválida.'), ...pageFields })
const idSchema = z.object({ id: z.uuid('Página inválida.') })

const toggleSchema = z.object({
  id: z.uuid('Página inválida.'),
  is_published: z.boolean('Informe se a página fica publicada.'),
})

export type PageInput = z.input<typeof pageSchema>

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  console.error('[pages]', error)
  return fallback
}

/** 23505 é a unique de `slug`: o caso comum, não um bug. */
function translateDbError(
  error: { code?: string | null; message?: string | null },
  fallback: string
): string {
  if (error.code === '23505') return 'Já existe uma página com este endereço.'
  console.error('[pages:db]', error.code, error.message)
  return fallback
}

async function logPage(
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
    p_entity_type: 'page',
    p_entity_id: entityId,
    p_summary: summary,
    p_metadata: metadata,
  })
  if (error) console.error('[pages:log_admin_action]', error.message)
}

function revalidatePages(slug?: string | null, previousSlug?: string | null): void {
  revalidatePath('/admin/paginas')
  // O rodapé lista as páginas com show_in_footer: muda em todo o site.
  revalidatePath('/', 'layout')
  if (slug) revalidatePath(`/pagina/${slug}`)
  if (previousSlug && previousSlug !== slug) revalidatePath(`/pagina/${previousSlug}`)
}

export async function createPageAction(input: unknown): Promise<PageActionResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const data = parsed.data

  try {
    const user = await requirePermission('pages.write')
    const supabase = await createClient()

    const { data: page, error } = await supabase
      .from('pages')
      .insert({ ...data, content: sanitizeHtml(data.content) || null })
      .select('id, slug')
      .single()

    if (error || !page) {
      return { ok: false, error: translateDbError(error ?? {}, 'Não foi possível criar a página.') }
    }

    await logPage(supabase, user, 'page.create', page.id as string, `Página "${data.title}" criada.`, {
      slug: data.slug,
      is_published: data.is_published,
    })

    revalidatePages(data.slug)
    return { ok: true, id: page.id as string, slug: page.slug as string }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível criar a página.') }
  }
}

export async function updatePageAction(input: unknown): Promise<PageActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id, ...data } = parsed.data

  try {
    const user = await requirePermission('pages.write')
    const supabase = await createClient()

    // O slug antigo precisa ser revalidado também: mudar o endereço deixaria a
    // rota velha em cache servindo a página que já não existe.
    const { data: existing } = await supabase.from('pages').select('slug').eq('id', id).maybeSingle()

    const { data: updated, error } = await supabase
      .from('pages')
      .update({ ...data, content: sanitizeHtml(data.content) || null })
      .eq('id', id)
      .select('id, slug')
      .maybeSingle()

    if (error) {
      return { ok: false, error: translateDbError(error, 'Não foi possível salvar a página.') }
    }
    if (!updated) return { ok: false, error: 'Página não encontrada.' }

    await logPage(supabase, user, 'page.update', id, `Página "${data.title}" atualizada.`, {
      slug: data.slug,
      is_published: data.is_published,
    })

    revalidatePages(data.slug, existing?.slug as string | undefined)
    revalidatePath(`/admin/paginas/${id}`)
    return { ok: true, id, slug: updated.slug as string }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar a página.') }
  }
}

export async function togglePagePublishedAction(input: unknown): Promise<PageActionResult> {
  const parsed = toggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id, is_published } = parsed.data

  try {
    const user = await requirePermission('pages.write')
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('pages')
      .update({ is_published })
      .eq('id', id)
      .select('id, slug, title')
      .maybeSingle()

    if (error) return { ok: false, error: 'Não foi possível alterar a página.' }
    if (!updated) return { ok: false, error: 'Página não encontrada.' }

    await logPage(
      supabase,
      user,
      is_published ? 'page.publish' : 'page.unpublish',
      id,
      `Página "${updated.title as string}" ${is_published ? 'publicada' : 'despublicada'}.`
    )

    revalidatePages(updated.slug as string)
    return { ok: true, id, slug: updated.slug as string }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível alterar a página.') }
  }
}

export async function deletePageAction(input: unknown): Promise<PageActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { id } = parsed.data

  try {
    const user = await requirePermission('pages.delete')
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('pages')
      .select('slug, title')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) return { ok: false, error: 'Não foi possível excluir a página.' }

    await logPage(
      supabase,
      user,
      'page.delete',
      id,
      `Página "${(existing?.title as string | undefined) ?? id}" excluída.`
    )

    revalidatePages((existing?.slug as string | undefined) ?? null)
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível excluir a página.') }
  }
}
