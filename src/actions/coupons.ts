'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission } from '@/lib/types/database.types'

// =============================================================================
// CUPONS
// -----------------------------------------------------------------------------
// Client de sessão em tudo: as policies coupons_admin_write/read (0007) cobrem
// insert, update e delete. O cliente da loja NUNCA lista cupons — se listasse,
// bastaria abrir o painel de rede do navegador para varrer códigos válidos.
//
// SEMÂNTICA DE `value` (numeric(10,2)), que é onde é fácil errar:
//   * type = 'percentage' → value é o PERCENTUAL (10 = 10%). O banco tem
//     constraint coupons_percentage_max garantindo value <= 100.
//   * type = 'fixed'      → value é o valor em REAIS (69.90). A RPC
//     compute_coupon_discount faz floor(value * 100) para chegar em centavos.
// Os demais campos de dinheiro (mínimo, teto de desconto) são inteiros em
// CENTAVOS, como o resto do sistema. A tela converte "69,90" antes de enviar.
// =============================================================================

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface CouponMutationResult extends ActionResult {
  couponId?: string
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
      p_entity_type: 'coupon',
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    })
  } catch (error) {
    console.error('[log_admin_action:coupon]', action, error)
  }
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

function translateDbError(error: { code?: string | null; message?: string | null }): string {
  const code = error.code ?? ''
  const known: Record<string, string> = {
    '23505': 'Já existe um cupom com este código.',
    '23514': 'Os valores do cupom não passaram na validação do banco.',
    '42501': 'Sem permissão para alterar cupons.',
    '22P02': 'Há um valor inválido no formulário.',
  }
  if (known[code]) return known[code]

  console.error('[coupons:db]', { code, message: error.message })
  return 'Não foi possível salvar o cupom.'
}

/** "" e espaços viram null — campo opcional de formulário. */
function emptyToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Aceita number ou string numérica (input devolve string). */
function toNumberOrNull(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

/**
 * Data em ISO. A tela converte o `datetime-local` para ISO antes de enviar —
 * se a string chegasse sem fuso, o servidor a interpretaria no fuso DELE e o
 * cupom começaria a valer na hora errada para o lojista.
 */
const isoDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
    .transform((value) => new Date(value).toISOString())
    .nullable()
)

const couponSchema = z
  .object({
    code: z
      .string('Informe o código do cupom.')
      .trim()
      .min(3, 'O código precisa de pelo menos 3 caracteres.')
      .max(40, 'O código pode ter no máximo 40 caracteres.')
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9_-]+$/.test(value),
        'Use apenas letras, números, hífen e sublinhado no código.'
      ),

    description: z.preprocess(
      emptyToNull,
      z.string().max(300, 'A descrição pode ter no máximo 300 caracteres.').nullable()
    ),

    type: z.enum(['percentage', 'fixed'], 'Escolha o tipo do cupom.'),

    value: z.preprocess(
      toNumberOrNull,
      z
        .number('Informe o valor do desconto.')
        .positive('O valor do desconto precisa ser maior que zero.')
        .max(999999, 'Valor de desconto fora da faixa aceita.')
    ),

    minimum_order_cents: z.preprocess(
      toNumberOrNull,
      z
        .number()
        .int('Pedido mínimo inválido.')
        .min(0, 'O pedido mínimo não pode ser negativo.')
        .nullable()
        .transform((value) => value ?? 0)
    ),

    maximum_discount_cents: z.preprocess(
      toNumberOrNull,
      z
        .number()
        .int('Desconto máximo inválido.')
        .positive('O desconto máximo precisa ser maior que zero.')
        .nullable()
    ),

    usage_limit: z.preprocess(
      toNumberOrNull,
      z
        .number()
        .int('Limite de usos inválido.')
        .positive('O limite de usos precisa ser maior que zero.')
        .nullable()
    ),

    per_customer_limit: z.preprocess(
      toNumberOrNull,
      z
        .number()
        .int('Limite por cliente inválido.')
        .positive('O limite por cliente precisa ser pelo menos 1.')
        .nullable()
        .transform((value) => value ?? 1)
    ),

    starts_at: isoDate,
    expires_at: isoDate,

    is_active: z
      .boolean()
      .nullish()
      .transform((value) => value ?? true),
  })
  .superRefine((data, ctx) => {
    // Espelha a constraint coupons_percentage_max. Sem isto o erro só apareceria
    // como "23514" vindo do banco, sem dizer qual campo está errado.
    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Cupom percentual não pode passar de 100%.',
      })
    }

    // Espelha coupons_window_valid.
    if (data.starts_at && data.expires_at && data.expires_at <= data.starts_at) {
      ctx.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'A expiração precisa ser depois do início.',
      })
    }
  })

export type CouponFormInput = z.input<typeof couponSchema>

function toRow(data: z.output<typeof couponSchema>) {
  return {
    code: data.code,
    description: data.description,
    type: data.type,
    value: data.value,
    minimum_order_cents: data.minimum_order_cents,
    maximum_discount_cents: data.maximum_discount_cents,
    usage_limit: data.usage_limit,
    per_customer_limit: data.per_customer_limit,
    starts_at: data.starts_at,
    expires_at: data.expires_at,
    is_active: data.is_active,
  }
}

function revalidateCoupons(id?: string): void {
  revalidatePath('/admin/cupons')
  if (id) revalidatePath(`/admin/cupons/${id}`)
}

// =============================================================================
// CRIAR
// =============================================================================
export async function createCouponAction(input: unknown): Promise<CouponMutationResult> {
  const parsed = couponSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('coupons.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('coupons')
      .insert(toRow(parsed.data))
      .select('id')
      .single()

    if (error) return { ok: false, error: translateDbError(error) }

    await logAction(
      auth.user.id,
      'coupon.create',
      data.id as string,
      `Criou o cupom ${parsed.data.code}.`,
      { code: parsed.data.code, type: parsed.data.type, value: parsed.data.value }
    )

    revalidateCoupons(data.id as string)
    return { ok: true, couponId: data.id as string }
  } catch (error) {
    console.error('[createCouponAction]', error)
    return { ok: false, error: 'Não foi possível criar o cupom agora.' }
  }
}

// =============================================================================
// ATUALIZAR
// =============================================================================
/**
 * `usage_count` NÃO entra no update: quem o incrementa é a mark_order_paid,
 * dentro da transação do pagamento. Deixar o formulário escrever nesse número
 * permitiria zerar o limite de uso de um cupom já esgotado.
 */
export async function updateCouponAction(id: unknown, input: unknown): Promise<ActionResult> {
  const ids = z.uuid('Cupom inválido.').safeParse(id)
  if (!ids.success) return { ok: false, error: 'Cupom inválido.' }

  const parsed = couponSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('coupons.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('coupons').update(toRow(parsed.data)).eq('id', ids.data)

    if (error) return { ok: false, error: translateDbError(error) }

    await logAction(
      auth.user.id,
      'coupon.update',
      ids.data,
      `Atualizou o cupom ${parsed.data.code}.`,
      { code: parsed.data.code, is_active: parsed.data.is_active }
    )

    revalidateCoupons(ids.data)
    return { ok: true }
  } catch (error) {
    console.error('[updateCouponAction]', error)
    return { ok: false, error: 'Não foi possível salvar o cupom agora.' }
  }
}

// =============================================================================
// ATIVAR / DESATIVAR
// =============================================================================
const toggleSchema = z.object({
  id: z.uuid('Cupom inválido.'),
  active: z.boolean(),
})

/** Atalho da listagem. Desativar é o caminho seguro; excluir apaga histórico. */
export async function toggleCouponActiveAction(
  id: unknown,
  active: unknown
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse({ id, active })
  if (!parsed.success) return { ok: false, error: 'Cupom inválido.' }

  const auth = await authorize('coupons.write')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('coupons')
      .update({ is_active: parsed.data.active })
      .eq('id', parsed.data.id)
      .select('code')
      .maybeSingle()

    if (error) return { ok: false, error: translateDbError(error) }
    if (!data) return { ok: false, error: 'Cupom não encontrado.' }

    await logAction(
      auth.user.id,
      parsed.data.active ? 'coupon.activate' : 'coupon.deactivate',
      parsed.data.id,
      `${parsed.data.active ? 'Ativou' : 'Desativou'} o cupom ${data.code}.`
    )

    revalidateCoupons(parsed.data.id)
    return { ok: true }
  } catch (error) {
    console.error('[toggleCouponActiveAction]', error)
    return { ok: false, error: 'Não foi possível atualizar o cupom agora.' }
  }
}

// =============================================================================
// EXCLUIR
// =============================================================================
/**
 * Exclusão definitiva.
 *
 * ATENÇÃO ao efeito colateral do schema: `coupon_redemptions` tem ON DELETE
 * CASCADE, então apagar o cupom apaga também o histórico de quem o usou. Os
 * pedidos sobrevivem (orders.coupon_id vira null e coupon_code continua como
 * snapshot), mas o relatório de resgates some. A tela avisa e oferece
 * "desativar" como caminho normal.
 */
export async function deleteCouponAction(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid('Cupom inválido.').safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Cupom inválido.' }

  const auth = await authorize('coupons.delete')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: coupon } = await supabase
      .from('coupons')
      .select('code, usage_count')
      .eq('id', parsed.data)
      .maybeSingle()

    if (!coupon) return { ok: false, error: 'Cupom não encontrado.' }

    const { error } = await supabase.from('coupons').delete().eq('id', parsed.data)
    if (error) return { ok: false, error: translateDbError(error) }

    await logAction(
      auth.user.id,
      'coupon.delete',
      parsed.data,
      `Excluiu o cupom ${coupon.code} (${coupon.usage_count} uso(s) registrados).`,
      { code: coupon.code, usage_count: coupon.usage_count }
    )

    revalidateCoupons()
    return { ok: true }
  } catch (error) {
    console.error('[deleteCouponAction]', error)
    return { ok: false, error: 'Não foi possível excluir o cupom agora.' }
  }
}
