'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/lib/types/database.types'

import {
  failureMessage,
  logAdminAction,
  nullableText,
  nullableUuid,
  positionSchema,
  translateCatalogError,
  uniqueSlug,
  type ActionResult,
  type ActionResultWithId,
  type ServerClient,
} from './catalog-shared'

// =============================================================================
// CRUD de categorias.
//
// A árvore tem duas travas no banco (check id <> parent_id e o trigger
// check_category_cycle) e uma aqui em cima. A daqui existe para o admin ler
// "não dá para pendurar a categoria dentro dela mesma" em vez de receber o
// texto cru do raise exception no meio do formulário.
// =============================================================================

function revalidateCategories(slugs: (string | null | undefined)[] = []): void {
  revalidatePath('/admin/categorias')
  revalidatePath('/')
  revalidatePath('/produtos')
  for (const slug of slugs) {
    if (slug) revalidatePath(`/categoria/${slug}`)
  }
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const categoryFieldsSchema = z.object({
  name: z
    .string('Informe o nome da categoria.')
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),

  slug: nullableText(160, 'O slug'),
  description: nullableText(2000, 'A descrição'),
  parent_id: nullableUuid('Categoria pai inválida.'),
  image_url: nullableText(2000, 'O endereço da imagem'),
  banner_url: nullableText(2000, 'O endereço do banner'),
  position: positionSchema,
  is_active: z.boolean('Valor inválido para "ativa".'),
  is_featured: z.boolean('Valor inválido para "categoria popular".'),
  show_on_home: z.boolean('Valor inválido para "carrossel na home".'),
  seo_title: nullableText(200, 'O título de SEO'),
  seo_description: nullableText(300, 'A descrição de SEO'),
})

const createCategorySchema = categoryFieldsSchema
const updateCategorySchema = categoryFieldsSchema.extend({ id: z.uuid('Categoria inválida.') })

type CategoryFields = z.output<typeof categoryFieldsSchema>

function categoryColumns(data: CategoryFields, slug: string) {
  return {
    name: data.name,
    slug,
    description: data.description ?? null,
    parent_id: data.parent_id ?? null,
    image_url: data.image_url ?? null,
    banner_url: data.banner_url ?? null,
    position: data.position ?? 0,
    is_active: data.is_active,
    is_featured: data.is_featured,
    show_on_home: data.show_on_home,
    seo_title: data.seo_title ?? null,
    seo_description: data.seo_description ?? null,
  }
}

/**
 * Ids que NÃO podem virar pai de `categoryId`: ele mesmo e toda a sua
 * descendência. Sem isso, "Contas" vira filha de "Contas > Premium" e o menu
 * recursivo da vitrine roda para sempre.
 */
async function forbiddenParents(
  supabase: ServerClient,
  categoryId: string
): Promise<Set<string>> {
  const { data } = await supabase.from('categories').select('id, parent_id')
  const rows = (data ?? []) as Pick<Category, 'id' | 'parent_id'>[]

  const childrenOf = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.parent_id) continue
    const list = childrenOf.get(row.parent_id) ?? []
    list.push(row.id)
    childrenOf.set(row.parent_id, list)
  }

  const blocked = new Set<string>([categoryId])
  const queue = [categoryId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const child of childrenOf.get(current) ?? []) {
      if (blocked.has(child)) continue
      blocked.add(child)
      queue.push(child)
    }
  }
  return blocked
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

export async function createCategory(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('categories.write')

    const parsed = createCategorySchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()
    const slug = await uniqueSlug(supabase, 'categories', data.slug ?? data.name, data.name)

    const { data: created, error } = await supabase
      .from('categories')
      .insert(categoryColumns(data, slug))
      .select('id')
      .single()

    if (error) return { ok: false, error: translateCatalogError(error, 'createCategory') }

    const categoryId = (created as { id: string }).id

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'category.create',
      entityType: 'category',
      entityId: categoryId,
      summary: `Criou a categoria "${data.name}"`,
    })

    revalidateCategories([slug])
    return { ok: true, id: categoryId }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'createCategory') }
  }
}

export async function updateCategory(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('categories.write')

    const parsed = updateCategorySchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()

    const { data: current } = await supabase
      .from('categories')
      .select('id, slug')
      .eq('id', data.id)
      .maybeSingle()

    if (!current) return { ok: false, error: 'Categoria não encontrada.' }
    const currentSlug = (current as Pick<Category, 'slug'>).slug

    if (data.parent_id) {
      const blocked = await forbiddenParents(supabase, data.id)
      if (blocked.has(data.parent_id)) {
        return {
          ok: false,
          error:
            data.parent_id === data.id
              ? 'Uma categoria não pode ser pai dela mesma.'
              : 'A categoria pai escolhida está dentro desta categoria. Escolha outra.',
        }
      }
    }

    const slug =
      data.slug === currentSlug
        ? currentSlug
        : await uniqueSlug(supabase, 'categories', data.slug ?? data.name, data.name, data.id)

    const { error } = await supabase
      .from('categories')
      .update(categoryColumns(data, slug))
      .eq('id', data.id)

    if (error) return { ok: false, error: translateCatalogError(error, 'updateCategory') }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'category.update',
      entityType: 'category',
      entityId: data.id,
      summary: `Editou a categoria "${data.name}"`,
    })

    revalidateCategories([slug, currentSlug])
    revalidatePath(`/admin/categorias/${data.id}`)
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'updateCategory') }
  }
}

const idSchema = z.object({ id: z.uuid('Categoria inválida.') })

/**
 * Exclusão.
 *
 * As FKs são `on delete set null`: subcategorias viram raiz e os produtos
 * ficam sem categoria principal — nada é apagado junto, mas a organização se
 * desfaz. Por isso a tela avisa quantos itens serão afetados antes.
 */
export async function deleteCategory(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('categories.delete')

    const parsed = idSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Categoria inválida.' }

    const supabase = await createClient()

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!category) return { ok: false, error: 'Categoria não encontrada.' }
    const target = category as Pick<Category, 'id' | 'name' | 'slug'>

    const { error } = await supabase.from('categories').delete().eq('id', target.id)
    if (error) return { ok: false, error: translateCatalogError(error, 'deleteCategory') }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'category.delete',
      entityType: 'category',
      entityId: target.id,
      summary: `Excluiu a categoria "${target.name}"`,
    })

    revalidateCategories([target.slug])
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'deleteCategory') }
  }
}

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid('Categoria inválida.'),
        position: z.number('Posição inválida.').int().min(0).max(100_000),
      })
    )
    .min(1, 'Nada para reordenar.')
    .max(200, 'Muitas categorias de uma vez.'),
})

/**
 * Persiste a ordem depois do arrasto.
 *
 * O PostgREST não faz um UPDATE com valor diferente por linha, e o upsert não
 * serve porque `name` e `slug` são NOT NULL — a linha de insert precisaria vir
 * completa. Então é um UPDATE por irmão, em paralelo: são poucos, e o
 * conjunto todo é reenviado a cada arrasto, o que torna a operação idempotente.
 */
export async function reorderCategories(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('categories.write')

    const parsed = reorderSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()

    const results = await Promise.all(
      parsed.data.items.map((item) =>
        supabase.from('categories').update({ position: item.position }).eq('id', item.id)
      )
    )

    const failed = results.find((result) => result.error)
    if (failed?.error) {
      return { ok: false, error: translateCatalogError(failed.error, 'reorderCategories') }
    }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'category.reorder',
      entityType: 'category',
      entityId: null,
      summary: `Reordenou ${parsed.data.items.length} categoria(s)`,
    })

    revalidateCategories()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'reorderCategories') }
  }
}
