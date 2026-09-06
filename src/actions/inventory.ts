'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission, DigitalContentType } from '@/lib/types/database.types'

// =============================================================================
// ESTOQUE DIGITAL
// -----------------------------------------------------------------------------
// `digital_stock_items.content` é o dado mais sensível do sistema: é a chave, a
// credencial, o link que o cliente comprou. A policy digital_stock_admin_only
// (0007) exige inventory.read até para SELECT — nem o dono da compra lê essa
// tabela direto, ele recebe pela RPC get_my_delivery().
//
// Consequências práticas que este arquivo respeita:
//   * Client de SESSÃO em tudo. Nada de service_role: o RLS é justamente a
//     rede de proteção que sobra se um requirePermission for esquecido.
//   * O conteúdo só sai do servidor por revealStockItemAction(), uma chave por
//     vez e com log. A listagem manda apenas a máscara.
//   * Nenhum log leva o conteúdo — admin_logs é lido com logs.read, que é uma
//     permissão diferente de inventory.read.
// =============================================================================

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface AddStockResult extends ActionResult {
  added?: number
  duplicates?: number
}

export interface RevealResult extends ActionResult {
  content?: string
}

async function authorize(
  permission: AppPermission
): Promise<{ user: SessionUser } | { error: string }> {
  try {
    return { user: await requirePermission(permission) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sem permissão para esta ação.' }
  }
}

async function logAction(
  actorId: string,
  action: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('log_admin_action', {
      p_actor_id: actorId,
      p_action: action,
      p_entity_type: 'digital_stock',
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    })
  } catch (error) {
    console.error('[log_admin_action:inventory]', action, error)
  }
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

function revalidateStock(productId?: string | null): void {
  revalidatePath('/admin/estoque')
  revalidatePath('/admin/produtos')
  if (productId) revalidatePath(`/admin/produtos/${productId}`)
}

// =============================================================================
// 1. ADICIONAR CHAVES EM LOTE
// =============================================================================
const MAX_BATCH = 500

const addSchema = z.object({
  productId: z.uuid('Escolha o produto.'),
  contentType: z.enum(['code', 'link', 'file', 'credential', 'text'], 'Tipo de conteúdo inválido.'),
  raw: z
    .string('Cole as chaves, uma por linha.')
    .min(1, 'Cole pelo menos uma chave.')
    .max(200_000, 'Lote grande demais. Divida em partes menores.'),
  note: z
    .string()
    .trim()
    .max(200, 'A observação pode ter no máximo 200 caracteres.')
    .nullish()
    .transform((value) => (value ? value : null)),
})

/**
 * Recebe um textarea com uma chave por linha.
 *
 * Deduplica DENTRO do lote (colar a mesma lista duas vezes por engano é o erro
 * mais comum). Não deduplica contra o que já existe no banco: não há unique em
 * `content`, e uma loja pode legitimamente ter duas unidades idênticas do mesmo
 * item — quem decide isso é o lojista, não este código.
 */
export async function addStockItemsAction(input: unknown): Promise<AddStockResult> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('inventory.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  const seen = new Set<string>()
  let duplicates = 0

  for (const line of parsed.data.raw.split(/\r?\n/)) {
    const content = line.trim()
    if (content === '') continue
    if (seen.has(content)) {
      duplicates += 1
      continue
    }
    seen.add(content)
  }

  if (seen.size === 0) {
    return { ok: false, error: 'Nenhuma linha válida encontrada.' }
  }
  if (seen.size > MAX_BATCH) {
    return {
      ok: false,
      error: `Máximo de ${MAX_BATCH} chaves por lote. Você colou ${seen.size}.`,
    }
  }

  try {
    const supabase = await createClient()

    const { data: product } = await supabase
      .from('products')
      .select('id, name, stock_policy')
      .eq('id', parsed.data.productId)
      .maybeSingle()

    if (!product) return { ok: false, error: 'Produto não encontrado.' }

    // Chave em produto que não usa chave nunca seria vendida: a create_order só
    // reserva digital_stock_items quando stock_policy = 'digital_keys'.
    if (product.stock_policy !== 'digital_keys') {
      return {
        ok: false,
        error:
          'Este produto não usa estoque de chaves. Mude a política de estoque para "digital_keys" antes de cadastrar chaves.',
      }
    }

    const rows = Array.from(seen).map((content) => ({
      product_id: parsed.data.productId,
      content,
      content_type: parsed.data.contentType as DigitalContentType,
      status: 'available',
      note: parsed.data.note,
    }))

    const { error } = await supabase.from('digital_stock_items').insert(rows)

    if (error) {
      console.error('[addStockItemsAction:insert]', error)
      return { ok: false, error: 'Não foi possível salvar as chaves.' }
    }

    await logAction(
      auth.user.id,
      'stock.add',
      parsed.data.productId,
      `Adicionou ${rows.length} chave(s) em "${product.name}".`,
      { count: rows.length, content_type: parsed.data.contentType, duplicates }
    )

    revalidateStock(parsed.data.productId)
    return { ok: true, added: rows.length, duplicates }
  } catch (error) {
    console.error('[addStockItemsAction]', error)
    return { ok: false, error: 'Não foi possível salvar as chaves agora.' }
  }
}

// =============================================================================
// 2. EXCLUIR UMA CHAVE
// =============================================================================
const stockIdSchema = z.uuid('Chave inválida.')

/**
 * Só apaga chave `available`.
 *
 * Reservada está presa a um pedido em aberto; entregue é o comprovante do que
 * o cliente recebeu. Apagar qualquer uma das duas deixaria pedido órfão e
 * suporte sem resposta.
 */
export async function deleteStockItemAction(id: unknown): Promise<ActionResult> {
  const parsed = stockIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Chave inválida.' }

  const auth = await authorize('inventory.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: item } = await supabase
      .from('digital_stock_items')
      .select('id, product_id, status')
      .eq('id', parsed.data)
      .maybeSingle()

    if (!item) return { ok: false, error: 'Chave não encontrada.' }

    if (item.status === 'reserved') {
      return { ok: false, error: 'Esta chave está reservada para um pedido em aberto.' }
    }
    if (item.status === 'delivered') {
      return { ok: false, error: 'Esta chave já foi entregue e faz parte do histórico do pedido.' }
    }

    // Filtro de status repetido no DELETE: entre o SELECT e o DELETE o checkout
    // de outra pessoa pode ter reservado esta chave.
    const { error, count } = await supabase
      .from('digital_stock_items')
      .delete({ count: 'exact' })
      .eq('id', parsed.data)
      .in('status', ['available', 'disabled'])

    if (error) {
      console.error('[deleteStockItemAction]', error)
      return { ok: false, error: 'Não foi possível excluir a chave.' }
    }
    if (count === 0) {
      return { ok: false, error: 'A chave foi reservada por um pedido enquanto você olhava a tela.' }
    }

    await logAction(auth.user.id, 'stock.delete', item.product_id as string, 'Excluiu uma chave do estoque.', {
      stock_item_id: item.id,
      previous_status: item.status,
    })

    revalidateStock(item.product_id as string)
    return { ok: true }
  } catch (error) {
    console.error('[deleteStockItemAction]', error)
    return { ok: false, error: 'Não foi possível excluir a chave agora.' }
  }
}

// =============================================================================
// 3. DESABILITAR / REABILITAR
// =============================================================================
const toggleSchema = z.object({
  id: z.uuid('Chave inválida.'),
  disabled: z.boolean(),
})

/**
 * Tira a chave do pool sem apagá-la — o caminho para "esta chave veio quebrada
 * do fornecedor". Só vai e volta entre `available` e `disabled`; reservada e
 * entregue não se mexem.
 */
export async function toggleStockItemAction(id: unknown, disabled: unknown): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse({ id, disabled })
  if (!parsed.success) return { ok: false, error: 'Chave inválida.' }

  const auth = await authorize('inventory.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  const from = parsed.data.disabled ? 'available' : 'disabled'
  const to = parsed.data.disabled ? 'disabled' : 'available'

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('digital_stock_items')
      .update({ status: to })
      .eq('id', parsed.data.id)
      .eq('status', from)
      .select('id, product_id')
      .maybeSingle()

    if (error) {
      console.error('[toggleStockItemAction]', error)
      return { ok: false, error: 'Não foi possível atualizar a chave.' }
    }
    if (!data) {
      return {
        ok: false,
        error: parsed.data.disabled
          ? 'Só é possível desabilitar chave disponível.'
          : 'Só é possível reabilitar chave desabilitada.',
      }
    }

    await logAction(
      auth.user.id,
      parsed.data.disabled ? 'stock.disable' : 'stock.enable',
      data.product_id as string,
      parsed.data.disabled ? 'Desabilitou uma chave do estoque.' : 'Reabilitou uma chave do estoque.',
      { stock_item_id: data.id }
    )

    revalidateStock(data.product_id as string)
    return { ok: true }
  } catch (error) {
    console.error('[toggleStockItemAction]', error)
    return { ok: false, error: 'Não foi possível atualizar a chave agora.' }
  }
}

// =============================================================================
// 4. REVELAR UMA CHAVE
// =============================================================================
/**
 * Devolve o conteúdo de UMA chave e registra quem olhou.
 *
 * A listagem nunca recebe o conteúdo inteiro — só a máscara. Sem isso, abrir a
 * tela de estoque despejaria o catálogo inteiro de segredos no HTML, e o "olho"
 * de revelar seria enfeite de CSS.
 */
export async function revealStockItemAction(id: unknown): Promise<RevealResult> {
  const parsed = stockIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Chave inválida.' }

  const auth = await authorize('inventory.read')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('digital_stock_items')
      .select('id, product_id, content')
      .eq('id', parsed.data)
      .maybeSingle()

    if (error || !data) return { ok: false, error: 'Chave não encontrada.' }

    await logAction(
      auth.user.id,
      'stock.reveal',
      data.product_id as string,
      'Revelou o conteúdo de uma chave no painel.',
      { stock_item_id: data.id }
    )

    return { ok: true, content: data.content as string }
  } catch (error) {
    console.error('[revealStockItemAction]', error)
    return { ok: false, error: 'Não foi possível revelar a chave agora.' }
  }
}

// =============================================================================
// 5. ESTOQUE MANUAL (stock_policy = 'manual')
// =============================================================================
const manualStockSchema = z.object({
  productId: z.uuid('Produto inválido.'),
  quantity: z
    .number('Informe a quantidade.')
    .int('A quantidade precisa ser um número inteiro.')
    .min(0, 'A quantidade não pode ser negativa.')
    .max(1_000_000, 'Quantidade fora da faixa aceita.'),
})

/**
 * Ajusta products.stock_quantity para produtos de contagem manual.
 *
 * `stock_reserved` fica de fora: quem o move é a create_order/cancel_order,
 * dentro da transação. Editar reserva à mão aqui liberaria para venda um item
 * que já está preso num pedido em aberto.
 *
 * Note a permissão dupla: a operação é de estoque (inventory.write), mas a
 * escrita cai na tabela `products`, cuja policy exige products.write. Em vez de
 * contornar isso com service_role, o pedido é recusado com a explicação.
 */
export async function updateManualStockAction(input: unknown): Promise<ActionResult> {
  const parsed = manualStockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('inventory.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  if (!auth.user.permissions.has('products.write')) {
    return {
      ok: false,
      error: 'Alterar a quantidade grava na tabela de produtos e exige também a permissão products.write.',
    }
  }

  try {
    const supabase = await createClient()

    const { data: product } = await supabase
      .from('products')
      .select('id, name, stock_policy, stock_quantity, stock_reserved')
      .eq('id', parsed.data.productId)
      .maybeSingle()

    if (!product) return { ok: false, error: 'Produto não encontrado.' }
    if (product.stock_policy !== 'manual') {
      return {
        ok: false,
        error: 'Só produtos com política "manual" têm quantidade editável à mão.',
      }
    }

    if (parsed.data.quantity < (product.stock_reserved as number)) {
      return {
        ok: false,
        error: `Há ${product.stock_reserved} unidade(s) reservadas em pedidos abertos. A quantidade não pode ficar abaixo disso.`,
      }
    }

    const { error } = await supabase
      .from('products')
      .update({ stock_quantity: parsed.data.quantity })
      .eq('id', parsed.data.productId)

    if (error) {
      console.error('[updateManualStockAction]', error)
      return { ok: false, error: 'Não foi possível atualizar a quantidade.' }
    }

    await logAction(
      auth.user.id,
      'stock.manual_update',
      parsed.data.productId,
      `Ajustou o estoque de "${product.name}" de ${product.stock_quantity} para ${parsed.data.quantity}.`,
      { from: product.stock_quantity, to: parsed.data.quantity }
    )

    revalidateStock(parsed.data.productId)
    return { ok: true }
  } catch (error) {
    console.error('[updateManualStockAction]', error)
    return { ok: false, error: 'Não foi possível atualizar a quantidade agora.' }
  }
}
