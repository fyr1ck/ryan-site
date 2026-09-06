'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// =============================================================================
// Avaliação de produto.
//
// Quem decide se a pessoa PODE avaliar é o RLS: a policy de insert em `reviews`
// exige um pedido pago daquele produto. Por isso aqui se usa o client de
// servidor com a sessão do usuário, e NUNCA o createAdminClient() — o admin
// passaria por cima da policy e qualquer um poderia avaliar qualquer coisa.
//
// Toda avaliação nasce com is_approved = false e só aparece na vitrine depois
// da moderação (reviews.moderate).
// =============================================================================

/** Campo de formulário: "" e espaços em branco viram undefined antes de validar. */
function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Aceita number ou string numérica — radio de estrelas devolve string. */
function toNumber(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

const createReviewSchema = z.object({
  product_id: z.uuid('Produto inválido.'),

  order_id: z.preprocess(emptyToUndefined, z.uuid('Pedido inválido.').optional()),

  rating: z.preprocess(
    toNumber,
    z
      .number('Dê uma nota de 1 a 5 estrelas.')
      .int('Dê uma nota de 1 a 5 estrelas.')
      .min(1, 'A nota mínima é 1 estrela.')
      .max(5, 'A nota máxima é 5 estrelas.')
  ),

  comment: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(3, 'Escreva pelo menos 3 caracteres ou deixe o comentário em branco.')
      .max(1000, 'O comentário pode ter no máximo 1000 caracteres.')
      .optional()
  ),
})

export type CreateReviewInput = z.input<typeof createReviewSchema>

export interface CreateReviewResult {
  ok: boolean
  error?: string
  reviewId?: string
}

interface DbErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/**
 * 42501 é a negativa do RLS: a pessoa não tem compra paga deste produto. Essa
 * é a resposta esperada do caminho feliz de quem não comprou, não um bug.
 */
function translateReviewError(error: DbErrorLike): string {
  const code = error.code ?? ''

  if (code === 'P0001' && error.message) return error.message

  const known: Record<string, string> = {
    '42501': 'Só quem comprou este produto pode avaliá-lo.',
    '23505': 'Você já avaliou este produto.',
    '23503': 'Produto ou pedido não encontrado.',
    '23514': 'A avaliação não passou na validação do servidor.',
    '22P02': 'Há um dado inválido na avaliação.',
  }

  if (known[code]) return known[code]

  console.error('[createReviewAction:db]', {
    code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
  return 'Não foi possível enviar sua avaliação. Tente novamente.'
}

/**
 * Nome público da avaliação. O e-mail nunca entra aqui: `reviews` é lido por
 * qualquer visitante e o local part do e-mail já é dado pessoal demais.
 */
function displayName(fullName: string | null): string {
  const name = fullName?.trim()
  return name && name.length >= 2 ? name.slice(0, 120) : 'Cliente'
}

export async function createReviewAction(input: unknown): Promise<CreateReviewResult> {
  const parsed = createReviewSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const data = parsed.data

  const user = await getSessionUser()
  if (!user) {
    return { ok: false, error: 'Entre na sua conta para avaliar este produto.' }
  }

  try {
    const supabase = await createClient()

    // Slug só para revalidar a página certa. Se o produto não existe (ou está
    // fora do que o RLS deixa ler), para aqui em vez de gravar órfão.
    const { data: product } = await supabase
      .from('products')
      .select('slug')
      .eq('id', data.product_id)
      .maybeSingle()

    if (!product?.slug) {
      return { ok: false, error: 'Produto não encontrado.' }
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        product_id: data.product_id,
        order_id: data.order_id ?? null,
        user_id: user.id,
        customer_name: displayName(user.fullName),
        rating: data.rating,
        comment: data.comment ?? null,
        // Não confiar em default: deixar explícito que nada entra aprovado.
        is_approved: false,
      })
      .select('id')
      .single()

    if (error) {
      return { ok: false, error: translateReviewError(error) }
    }

    revalidatePath(`/produto/${product.slug}`)

    return { ok: true, reviewId: review?.id as string | undefined }
  } catch (error) {
    console.error('[createReviewAction]', error)
    return { ok: false, error: 'Não foi possível enviar sua avaliação. Tente novamente.' }
  }
}
