'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Product, ProductStatus } from '@/lib/types/database.types'

import {
  failureMessage,
  logAdminAction,
  normalizeTags,
  nullableCents,
  nullableText,
  nullableUuid,
  translateCatalogError,
  uniqueIds,
  uniqueSlug,
  type ActionResult,
  type ActionResultWithId,
  type ServerClient,
} from './catalog-shared'

// =============================================================================
// CRUD de produtos do painel.
//
// Todas as escritas passam pelo client de servidor COM a sessão do admin, e não
// pelo service_role: as policies `products_admin_*` continuam valendo, então um
// bug aqui não vira escrita irrestrita no catálogo. O requirePermission() na
// primeira linha é a porta; o RLS é a tranca.
// =============================================================================

const MAX_CENTS = 1_000_000_000

/** Revalida painel e vitrine. O slug antigo entra junto quando ele mudou. */
function revalidateProduct(slugs: (string | null | undefined)[] = []): void {
  revalidatePath('/admin/produtos')
  revalidatePath('/')
  revalidatePath('/produtos')
  for (const slug of slugs) {
    if (slug) revalidatePath(`/produto/${slug}`)
  }
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const imageSchema = z.object({
  url: z.string().trim().min(1, 'Imagem sem endereço.').max(2000, 'Endereço de imagem longo demais.'),
  alt: nullableText(200, 'O texto alternativo'),
})

const productFieldsSchema = z.object({
  name: z
    .string('Informe o nome do produto.')
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(200, 'O nome pode ter no máximo 200 caracteres.'),

  // Vazio = gerar a partir do nome.
  slug: nullableText(200, 'O slug'),

  short_description: nullableText(300, 'A descrição curta'),
  description: nullableText(50_000, 'A descrição'),

  price_cents: z
    .number('Informe o preço.')
    .int('Preço inválido.')
    .min(0, 'O preço não pode ser negativo.')
    .max(MAX_CENTS, 'O preço está fora do limite.'),

  compare_at_cents: nullableCents('O preço "de"'),
  cost_cents: nullableCents('O custo'),

  sku: nullableText(100, 'O SKU'),

  status: z.enum(['draft', 'active', 'archived'], 'Status inválido.'),
  category_id: nullableUuid('Categoria inválida.'),

  delivery_type: z.enum(['automatic', 'manual'], 'Tipo de entrega inválido.'),
  stock_policy: z.enum(['unlimited', 'manual', 'digital_keys'], 'Política de estoque inválida.'),

  stock_quantity: z
    .number('Quantidade inválida.')
    .int('A quantidade precisa ser um número inteiro.')
    .min(0, 'A quantidade não pode ser negativa.')
    .max(1_000_000, 'Quantidade fora do limite.'),

  tags: z.array(z.string().max(40, 'Tag longa demais.')).max(30, 'No máximo 30 tags.'),

  is_featured: z.boolean('Valor inválido para destaque.'),

  seo_title: nullableText(200, 'O título de SEO'),
  seo_description: nullableText(300, 'A descrição de SEO'),

  images: z.array(imageSchema).max(20, 'No máximo 20 imagens por produto.'),
  collection_ids: z.array(z.uuid('Coleção inválida.')).max(50, 'Coleções demais.'),
  category_ids: z.array(z.uuid('Categoria inválida.')).max(50, 'Categorias demais.'),
})

/**
 * O banco tem CHECK (compare_at_cents > price_cents). Validar aqui é o que
 * transforma "new row violates check constraint" numa frase que o lojista lê.
 */
const comparePriceRefinement = {
  check: (data: { price_cents: number; compare_at_cents?: number | null }) =>
    data.compare_at_cents == null || data.compare_at_cents > data.price_cents,
  message: 'O preço "de" precisa ser MAIOR que o preço de venda. Deixe em branco se não houver promoção.',
  path: ['compare_at_cents'] as const,
}

const createProductSchema = productFieldsSchema.refine(comparePriceRefinement.check, {
  message: comparePriceRefinement.message,
  path: [...comparePriceRefinement.path],
})

const updateProductSchema = productFieldsSchema
  .extend({ id: z.uuid('Produto inválido.') })
  .refine(comparePriceRefinement.check, {
    message: comparePriceRefinement.message,
    path: [...comparePriceRefinement.path],
  })

type ProductFields = z.output<typeof productFieldsSchema>

// -----------------------------------------------------------------------------
// Relações (galeria, coleções, categorias secundárias)
// -----------------------------------------------------------------------------

/**
 * Substitui a galeria inteira: apaga e reinsere na ordem recebida.
 *
 * Não há transação entre as duas chamadas do PostgREST. Se o insert falhar
 * depois do delete, o produto fica sem imagem — visível e corrigível na hora,
 * ao contrário de uma galeria meio antiga e meio nova.
 */
async function replaceImages(
  supabase: ServerClient,
  productId: string,
  images: ProductFields['images']
): Promise<string | null> {
  const { error: deleteError } = await supabase
    .from('product_images')
    .delete()
    .eq('product_id', productId)

  if (deleteError) return translateCatalogError(deleteError, 'setProductImages')

  if (images.length === 0) return null

  const rows = images.map((image, index) => ({
    product_id: productId,
    url: image.url,
    alt: image.alt ?? null,
    position: index,
  }))

  const { error: insertError } = await supabase.from('product_images').insert(rows)
  if (insertError) return translateCatalogError(insertError, 'setProductImages')

  return null
}

async function replaceCollections(
  supabase: ServerClient,
  productId: string,
  collectionIds: string[]
): Promise<string | null> {
  const ids = uniqueIds(collectionIds)

  const { error: deleteError } = await supabase
    .from('collection_products')
    .delete()
    .eq('product_id', productId)

  if (deleteError) return translateCatalogError(deleteError, 'setProductCollections')
  if (ids.length === 0) return null

  const rows = ids.map((collectionId, index) => ({
    collection_id: collectionId,
    product_id: productId,
    position: index,
  }))

  const { error: insertError } = await supabase.from('collection_products').insert(rows)
  if (insertError) return translateCatalogError(insertError, 'setProductCollections')

  return null
}

async function replaceExtraCategories(
  supabase: ServerClient,
  productId: string,
  categoryIds: string[]
): Promise<string | null> {
  const ids = uniqueIds(categoryIds)

  const { error: deleteError } = await supabase
    .from('product_categories')
    .delete()
    .eq('product_id', productId)

  if (deleteError) return translateCatalogError(deleteError, 'setProductCategories')
  if (ids.length === 0) return null

  const rows = ids.map((categoryId, index) => ({
    product_id: productId,
    category_id: categoryId,
    position: index,
  }))

  const { error: insertError } = await supabase.from('product_categories').insert(rows)
  if (insertError) return translateCatalogError(insertError, 'setProductCategories')

  return null
}

/** Colunas da tabela `products` montadas a partir do formulário validado. */
function productColumns(data: ProductFields, slug: string) {
  return {
    name: data.name,
    slug,
    short_description: data.short_description ?? null,
    description: data.description ?? null,
    price_cents: data.price_cents,
    compare_at_cents: data.compare_at_cents ?? null,
    cost_cents: data.cost_cents ?? null,
    sku: data.sku ?? null,
    status: data.status,
    category_id: data.category_id ?? null,
    delivery_type: data.delivery_type,
    stock_policy: data.stock_policy,
    // Só a política "manual" usa este número. Em 'unlimited' ele é ignorado e
    // em 'digital_keys' o estoque é a contagem de chaves disponíveis — deixar
    // um valor velho aqui daria a impressão de que a aba Estoque não funciona.
    stock_quantity: data.stock_policy === 'manual' ? data.stock_quantity : 0,
    tags: normalizeTags(data.tags),
    is_featured: data.is_featured,
    seo_title: data.seo_title ?? null,
    seo_description: data.seo_description ?? null,
  }
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

export async function createProduct(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('products.write')

    const parsed = createProductSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()
    const slug = await uniqueSlug(supabase, 'products', data.slug ?? data.name, data.name)

    const { data: created, error } = await supabase
      .from('products')
      .insert(productColumns(data, slug))
      .select('id, slug')
      .single()

    if (error) return { ok: false, error: translateCatalogError(error, 'createProduct') }

    const productId = (created as Pick<Product, 'id' | 'slug'>).id

    const relationError =
      (await replaceImages(supabase, productId, data.images)) ??
      (await replaceCollections(supabase, productId, data.collection_ids)) ??
      (await replaceExtraCategories(supabase, productId, data.category_ids))

    if (relationError) {
      // O produto existe: mandar o admin de volta para a edição é melhor do
      // que apagar o que ele acabou de cadastrar por causa de uma imagem.
      return { ok: false, error: relationError, id: productId }
    }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.create',
      entityType: 'product',
      entityId: productId,
      summary: `Criou o produto "${data.name}"`,
    })

    revalidateProduct([slug])
    return { ok: true, id: productId }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'createProduct') }
  }
}

export async function updateProduct(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('products.write')

    const parsed = updateProductSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    const data = parsed.data

    const supabase = await createClient()

    const { data: current } = await supabase
      .from('products')
      .select('id, slug, name')
      .eq('id', data.id)
      .maybeSingle()

    if (!current) return { ok: false, error: 'Produto não encontrado.' }

    const currentSlug = (current as Pick<Product, 'slug'>).slug
    const desiredSlug = data.slug ?? data.name
    const slug =
      data.slug === currentSlug
        ? currentSlug
        : await uniqueSlug(supabase, 'products', desiredSlug, data.name, data.id)

    const { error } = await supabase
      .from('products')
      .update(productColumns(data, slug))
      .eq('id', data.id)

    if (error) return { ok: false, error: translateCatalogError(error, 'updateProduct') }

    const relationError =
      (await replaceImages(supabase, data.id, data.images)) ??
      (await replaceCollections(supabase, data.id, data.collection_ids)) ??
      (await replaceExtraCategories(supabase, data.id, data.category_ids))

    if (relationError) return { ok: false, error: relationError, id: data.id }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.update',
      entityType: 'product',
      entityId: data.id,
      summary: `Editou o produto "${data.name}"`,
    })

    revalidateProduct([slug, currentSlug])
    revalidatePath(`/admin/produtos/${data.id}`)
    return { ok: true, id: data.id }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'updateProduct') }
  }
}

const idSchema = z.object({ id: z.uuid('Produto inválido.') })

export async function deleteProduct(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('products.delete')

    const parsed = idSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Produto inválido.' }

    const supabase = await createClient()

    const { data: product } = await supabase
      .from('products')
      .select('id, name, slug')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!product) return { ok: false, error: 'Produto não encontrado.' }
    const target = product as Pick<Product, 'id' | 'name' | 'slug'>

    const { error } = await supabase.from('products').delete().eq('id', target.id)
    if (error) return { ok: false, error: translateCatalogError(error, 'deleteProduct') }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.delete',
      entityType: 'product',
      entityId: target.id,
      summary: `Excluiu o produto "${target.name}"`,
    })

    revalidateProduct([target.slug])
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'deleteProduct') }
  }
}

const toggleSchema = z.object({
  id: z.uuid('Produto inválido.'),
  /** Omitido = alterna entre ativo e rascunho. */
  status: z.enum(['draft', 'active', 'archived'], 'Status inválido.').optional(),
})

export async function toggleProductStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('products.write')

    const parsed = toggleSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()

    const { data: product } = await supabase
      .from('products')
      .select('id, name, slug, status')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!product) return { ok: false, error: 'Produto não encontrado.' }
    const target = product as Pick<Product, 'id' | 'name' | 'slug' | 'status'>

    const nextStatus: ProductStatus =
      parsed.data.status ?? (target.status === 'active' ? 'draft' : 'active')

    if (nextStatus === target.status) return { ok: true }

    const { error } = await supabase
      .from('products')
      .update({ status: nextStatus })
      .eq('id', target.id)

    if (error) return { ok: false, error: translateCatalogError(error, 'toggleProductStatus') }

    const label: Record<ProductStatus, string> = {
      draft: 'rascunho',
      active: 'ativo',
      archived: 'arquivado',
    }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.status',
      entityType: 'product',
      entityId: target.id,
      summary: `Mudou "${target.name}" para ${label[nextStatus]}`,
    })

    revalidateProduct([target.slug])
    revalidatePath(`/admin/produtos/${target.id}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'toggleProductStatus') }
  }
}

/**
 * Cópia para servir de ponto de partida.
 *
 * Nasce como RASCUNHO e sem SKU: o SKU é único no banco e uma cópia ativa por
 * engano é o tipo de erro que só aparece quando o cliente compra o produto
 * errado. Vendas e avaliações não são copiadas — são histórico do original.
 */
export async function duplicateProduct(input: unknown): Promise<ActionResultWithId> {
  try {
    const user = await requirePermission('products.write')

    const parsed = idSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Produto inválido.' }

    const supabase = await createClient()

    const { data: source } = await supabase
      .from('products')
      .select('*, product_images (url, alt, position)')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!source) return { ok: false, error: 'Produto não encontrado.' }

    const original = source as Product & {
      product_images: { url: string; alt: string | null; position: number }[]
    }

    const name = `${original.name} (cópia)`.slice(0, 200)
    const slug = await uniqueSlug(supabase, 'products', name, original.slug)

    const { data: created, error } = await supabase
      .from('products')
      .insert({
        name,
        slug,
        short_description: original.short_description,
        description: original.description,
        price_cents: original.price_cents,
        compare_at_cents: original.compare_at_cents,
        cost_cents: original.cost_cents,
        sku: null,
        status: 'draft',
        category_id: original.category_id,
        delivery_type: original.delivery_type,
        stock_policy: original.stock_policy,
        stock_quantity: original.stock_policy === 'manual' ? original.stock_quantity : 0,
        tags: original.tags,
        is_featured: false,
        position: original.position,
        seo_title: original.seo_title,
        seo_description: original.seo_description,
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: translateCatalogError(error, 'duplicateProduct') }

    const newId = (created as { id: string }).id

    const images = [...(original.product_images ?? [])].sort((a, b) => a.position - b.position)
    if (images.length > 0) {
      await replaceImages(
        supabase,
        newId,
        images.map((image) => ({ url: image.url, alt: image.alt }))
      )
    }

    const [{ data: collections }, { data: categories }] = await Promise.all([
      supabase
        .from('collection_products')
        .select('collection_id, position')
        .eq('product_id', original.id)
        .order('position'),
      supabase
        .from('product_categories')
        .select('category_id, position')
        .eq('product_id', original.id)
        .order('position'),
    ])

    const collectionIds = ((collections ?? []) as { collection_id: string }[]).map(
      (row) => row.collection_id
    )
    const categoryIds = ((categories ?? []) as { category_id: string }[]).map(
      (row) => row.category_id
    )

    if (collectionIds.length > 0) await replaceCollections(supabase, newId, collectionIds)
    if (categoryIds.length > 0) await replaceExtraCategories(supabase, newId, categoryIds)

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.duplicate',
      entityType: 'product',
      entityId: newId,
      summary: `Duplicou "${original.name}" como rascunho`,
    })

    revalidateProduct()
    return { ok: true, id: newId }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'duplicateProduct') }
  }
}

// -----------------------------------------------------------------------------
// Relações isoladas — usadas quando só a galeria/os vínculos mudam
// -----------------------------------------------------------------------------

const setImagesSchema = z.object({
  product_id: z.uuid('Produto inválido.'),
  images: z.array(imageSchema).max(20, 'No máximo 20 imagens por produto.'),
})

/** Substitui a galeria inteira pela lista recebida, na ordem recebida. */
export async function setProductImages(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('products.write')

    const parsed = setImagesSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()
    const error = await replaceImages(supabase, parsed.data.product_id, parsed.data.images)
    if (error) return { ok: false, error }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.images',
      entityType: 'product',
      entityId: parsed.data.product_id,
      summary: `Atualizou a galeria (${parsed.data.images.length} imagem(ns))`,
    })

    revalidateProduct()
    revalidatePath(`/admin/produtos/${parsed.data.product_id}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'setProductImages') }
  }
}

const setCollectionsSchema = z.object({
  product_id: z.uuid('Produto inválido.'),
  collection_ids: z.array(z.uuid('Coleção inválida.')).max(50, 'Coleções demais.'),
})

export async function setProductCollections(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('products.write')

    const parsed = setCollectionsSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()
    const error = await replaceCollections(
      supabase,
      parsed.data.product_id,
      parsed.data.collection_ids
    )
    if (error) return { ok: false, error }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.collections',
      entityType: 'product',
      entityId: parsed.data.product_id,
      summary: `Atualizou as coleções do produto (${parsed.data.collection_ids.length})`,
    })

    revalidateProduct()
    revalidatePath('/admin/colecoes')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'setProductCollections') }
  }
}

const setCategoriesSchema = z.object({
  product_id: z.uuid('Produto inválido.'),
  category_ids: z.array(z.uuid('Categoria inválida.')).max(50, 'Categorias demais.'),
})

/** Categorias ADICIONAIS. A principal é a coluna category_id do produto. */
export async function setProductCategories(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission('products.write')

    const parsed = setCategoriesSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const supabase = await createClient()
    const error = await replaceExtraCategories(
      supabase,
      parsed.data.product_id,
      parsed.data.category_ids
    )
    if (error) return { ok: false, error }

    await logAdminAction(supabase, {
      actorId: user.id,
      action: 'product.categories',
      entityType: 'product',
      entityId: parsed.data.product_id,
      summary: `Atualizou as categorias adicionais (${parsed.data.category_ids.length})`,
    })

    revalidateProduct()
    revalidatePath('/admin/categorias')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failureMessage(error, 'setProductCategories') }
  }
}
