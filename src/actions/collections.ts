'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Collection, ProductStatus } from '@/lib/types/database.types'

import {
  failureMessage,
  logAdminAction,
  nullableText,
  positionSchema,
  translateCatalogError,
  uniqueIds,
  uniqueSlug,
  type ActionResult,
  type ActionResultWithId,
  type CollectionProductOption,
  type SearchProductsResult,
} from './catalog-shared'

// =============================================================================
// CRUD de coleções + o gerenciador de produtos de cada coleção.
//
// Coleção é curadoria transversal ("Mais vendidos", "Promoções"): um produto
// pode estar em várias, e a ordem dentro dela é escolhida no painel — por isso
// collection_products carrega `position`.
// =============================================================================

function revalidateCollections(slugs: (string | null | undefined)[] = []): void {
  revalidatePath('/admin/colecoes')
  revalidatePath('/')
  revalidatePath('/produtos')
  for (const slug of slugs) {
    if (slug) revalidatePath(`/colecao/${slug}`)
  }
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const collectionFieldsSchema = z.object({
  name: z
    .string('Informe o nome da coleção.')
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),

  slug: nullableText(160, 'O slug'),
  description: nullableText(2000, 'A descrição'),
  image_url: nullableText(2000, 'O endereço da imagem'),
  banner_url: nullableText(2000, 'O endereço do banner'),
  position: positionSchema,
  is_active: z.boolean('Valor inválido para "ativa".'),
  show_on_home: z.boolean('Valor inválido para "aparecer na home".'),
  seo_title: nullableText(200, 'O título de SEO'),
  seo_description: nullableText(300, 'A descrição de SEO'),
})

const createCollectionSchema = collectionFieldsSchema
const updateCollectionSchema = collectionFieldsSchema.extend({ id: z.uuid('Coleção inválida.') })

type CollectionFields = z.output<typeof collectionFieldsSchema>

function collectionColumns(data: CollectionFields, slug: string, position: number) {
  return {
    name: data.name,
    slug,
    description: data.description ?? null,
    image_url: data.image_url ?? null,
    banner_url: data.banner_url ?? null,
    position,
    is_active: data.is_active,
    show_on_home: data.show_on_home,
    seo_title: data.seo_title ?? null,
    seo_description: data.seo_description ?? null,
  }
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

export async function createCollection(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('collections.write')

    const parsed = createCollectionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()
    const slug = await uniqueSlug(supabase, 'collections', data.slug ?? data.name, data.name)

    // Coleção nova entra no fim da fila da home em vez de empatar em zero
    // com todas as outras (empate = ordem imprevisível na vitrine).
    let position = data.position ?? null
    if (position == null) {
      const { data: last } = await supabase
        .from('collections')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      position = ((last as { position: number } | null)?.position ?? -1) + 1
    }

    const { data: created, error } = await supabase
      .from('collections')
      .insert(collectionColumns(data, slug, position))
      .select('id')
      .single()

    if (error) return { ok: false, error: translateCatalogError(error, 'createCollection') }

    const collectionId = (created as { id: string }).id

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'collection.create',
      entityType: 'collection',
      entityId: collectionId,
      summary: `Criou a coleção "${data.name}"`,
    })

    revalidateCollections([slug])
    return { ok: true, id: collectionId }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'createCollection') }
  }
}

export async function updateCollection(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('collections.write')

    const parsed = updateCollectionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()

    const { data: current } = await supabase
      .from('collections')
      .select('id, slug, position')
      .eq('id', data.id)
      .maybeSingle()

    if (!current) return { ok: false, error: 'Coleção não encontrada.' }
    const existing = current as Pick<Collection, 'slug' | 'position'>

    const slug =
      data.slug === existing.slug
        ? existing.slug
        : await uniqueSlug(supabase, 'collections', data.slug ?? data.name, data.name, data.id)

    const { error } = await supabase
      .from('collections')
      .update(collectionColumns(data, slug, data.position ?? existing.position))
      .eq('id', data.id)

    if (error) return { ok: false, error: translateCatalogError(error, 'updateCollection') }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'collection.update',
      entityType: 'collection',
      entityId: data.id,
      summary: `Editou a coleção "${data.name}"`,
    })

    revalidateCollections([slug, existing.slug])
    revalidatePath(`/admin/colecoes/${data.id}`)
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'updateCollection') }
  }
}

const idSchema = z.object({ id: z.uuid('Coleção inválida.') })

export async function deleteCollection(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('collections.delete')

    const parsed = idSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Coleção inválida.' }

    const supabase = await createClient()

    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!collection) return { ok: false, error: 'Coleção não encontrada.' }
    const target = collection as Pick<Collection, 'id' | 'name' | 'slug'>

    const { error } = await supabase.from('collections').delete().eq('id', target.id)
    if (error) return { ok: false, error: translateCatalogError(error, 'deleteCollection') }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'collection.delete',
      entityType: 'collection',
      entityId: target.id,
      summary: `Excluiu a coleção "${target.name}"`,
    })

    revalidateCollections([target.slug])
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'deleteCollection') }
  }
}

// -----------------------------------------------------------------------------
// Produtos da coleção
// -----------------------------------------------------------------------------

const setProductsSchema = z.object({
  collection_id: z.uuid('Coleção inválida.'),
  product_ids: z.array(z.uuid('Produto inválido.')).max(500, 'Produtos demais nesta coleção.'),
})

/**
 * Substitui a lista de produtos da coleção.
 *
 * A posição é o índice do array: quem chama manda a lista JÁ na ordem final,
 * então adicionar, remover e arrastar caem todos nesta mesma action e não há
 * chance de a ordem no banco divergir da ordem que o admin está vendo.
 */
export async function setCollectionProducts(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('collections.write')

    const parsed = setProductsSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()
    const ids = uniqueIds(parsed.data.product_ids)

    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('id', parsed.data.collection_id)
      .maybeSingle()

    if (!collection) return { ok: false, error: 'Coleção não encontrada.' }
    const target = collection as Pick<Collection, 'id' | 'name' | 'slug'>

    const { error: deleteError } = await supabase
      .from('collection_products')
      .delete()
      .eq('collection_id', target.id)

    if (deleteError) {
      return { ok: false, error: translateCatalogError(deleteError, 'setCollectionProducts') }
    }

    if (ids.length > 0) {
      const rows = ids.map((productId, index) => ({
        collection_id: target.id,
        product_id: productId,
        position: index,
      }))

      const { error: insertError } = await supabase.from('collection_products').insert(rows)
      if (insertError) {
        return { ok: false, error: translateCatalogError(insertError, 'setCollectionProducts') }
      }
    }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'collection.products',
      entityType: 'collection',
      entityId: target.id,
      summary: `Atualizou os produtos de "${target.name}" (${ids.length} item(ns))`,
    })

    revalidateCollections([target.slug])
    revalidatePath(`/admin/colecoes/${target.id}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'setCollectionProducts') }
  }
}

const searchSchema = z.object({
  term: z.string().trim().max(120, 'Busca longa demais.'),
  exclude_ids: z.array(z.uuid()).max(500).optional(),
})

/**
 * Busca do seletor "adicionar produto à coleção".
 *
 * Roda no servidor com a sessão do admin: rascunhos e arquivados aparecem
 * porque o RLS de products.read deixa, e o lojista precisa montar a coleção
 * antes de publicar o produto.
 */
export async function searchProductsForCollection(input: unknown): Promise<SearchProductsResult> {
  try {
    await requirePermission('collections.write')

    const parsed = searchSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: 'Busca inválida.', products: [] }
    }

    const supabase = await createClient()
    const term = parsed.data.term

    let query = supabase
      .from('products')
      .select('id, name, slug, price_cents, status, product_images (url, position)')
      .order('name')
      .limit(20)

    if (term) {
      // `%` e `_` do usuário viram literais: sem isso, digitar "%" traria a
      // tabela inteira e o seletor viraria um dump do catálogo.
      const safe = term.replace(/[\\%_]/g, (match) => `\\${match}`)
      query = query.ilike('name', `%${safe}%`)
    }

    const { data, error } = await query
    if (error) {
      return {
        ok: false,
        error: translateCatalogError(error, 'searchProductsForCollection'),
        products: [],
      }
    }

    const excluded = new Set(parsed.data.exclude_ids ?? [])

    const products: CollectionProductOption[] = ((data ?? []) as {
      id: string
      name: string
      slug: string
      price_cents: number
      status: ProductStatus
      product_images: { url: string; position: number }[] | null
    }[])
      .filter((row) => !excluded.has(row.id))
      .map((row) => {
        const cover = [...(row.product_images ?? [])].sort((a, b) => a.position - b.position)[0]
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          price_cents: row.price_cents,
          status: row.status,
          image_url: cover?.url ?? null,
        }
      })

    return { ok: true, products }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'searchProductsForCollection'), products: [] }
  }
}
