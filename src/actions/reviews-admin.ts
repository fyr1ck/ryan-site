'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission } from '@/lib/types/database.types'

// =============================================================================
// MODERAÇÃO DE AVALIAÇÕES
// -----------------------------------------------------------------------------
// Tudo aqui passa pelo client de SESSÃO: as policies reviews_admin_moderate e
// reviews_admin_delete (migration 0007) já cobrem update e delete. Não existe
// motivo para service_role — e usar service_role desligaria a única checagem
// que sobra caso alguém erre o requirePermission.
//
// Aprovar/ocultar mexe na nota do produto: o trigger reviews_refresh_rating
// recalcula rating_average e rating_count contando SÓ o que está aprovado.
// Por isso toda mutação revalida a página do produto, não só o painel.
// =============================================================================

export interface ActionResult {
  ok: boolean
  error?: string
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
      p_entity_type: 'review',
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    })
  } catch (error) {
    console.error('[log_admin_action:review]', action, error)
  }
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

interface ReviewRow {
  id: string
  product_id: string
  customer_name: string
  is_approved: boolean
  products: { slug: string; name: string } | null
}

/** Lê a avaliação junto com o slug do produto, que é o que precisa revalidar. */
async function loadReview(id: string): Promise<ReviewRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviews')
    .select('id, product_id, customer_name, is_approved, products(slug, name)')
    .eq('id', id)
    .maybeSingle()

  return (data as unknown as ReviewRow | null) ?? null
}

function revalidateReview(slug: string | null | undefined): void {
  revalidatePath('/admin/avaliacoes')
  revalidatePath('/')
  if (slug) revalidatePath(`/produto/${slug}`)
}

const reviewIdSchema = z.uuid('Avaliação inválida.')

// =============================================================================
// APROVAR / OCULTAR
// =============================================================================
async function setApproval(reviewId: unknown, approved: boolean): Promise<ActionResult> {
  const parsed = reviewIdSchema.safeParse(reviewId)
  if (!parsed.success) return { ok: false, error: 'Avaliação inválida.' }

  const auth = await authorize('reviews.moderate')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const review = await loadReview(parsed.data)
    if (!review) return { ok: false, error: 'Avaliação não encontrada.' }
    if (review.is_approved === approved) return { ok: true }

    const supabase = await createClient()
    const { error } = await supabase
      .from('reviews')
      .update({ is_approved: approved })
      .eq('id', parsed.data)

    if (error) {
      console.error('[setApproval]', error)
      return { ok: false, error: 'Não foi possível atualizar a avaliação.' }
    }

    await logAction(
      auth.user.id,
      approved ? 'review.approve' : 'review.hide',
      parsed.data,
      `${approved ? 'Aprovou' : 'Ocultou'} a avaliação de ${review.customer_name} em "${
        review.products?.name ?? 'produto removido'
      }".`,
      { product_id: review.product_id, is_approved: approved }
    )

    revalidateReview(review.products?.slug)
    return { ok: true }
  } catch (error) {
    console.error('[setApproval]', error)
    return { ok: false, error: 'Não foi possível atualizar a avaliação agora.' }
  }
}

/** Publica a avaliação na vitrine e faz o produto recalcular a nota. */
export async function approveReviewAction(reviewId: unknown): Promise<ActionResult> {
  return setApproval(reviewId, true)
}

/** Tira da vitrine sem apagar — o histórico do cliente continua existindo. */
export async function hideReviewAction(reviewId: unknown): Promise<ActionResult> {
  return setApproval(reviewId, false)
}

// =============================================================================
// RESPONDER
// =============================================================================
const replySchema = z.object({
  reviewId: z.uuid('Avaliação inválida.'),
  reply: z
    .string()
    .trim()
    .max(1000, 'A resposta pode ter no máximo 1000 caracteres.')
    // "" apaga a resposta: o botão "Remover resposta" usa o mesmo caminho.
    .transform((value) => (value === '' ? null : value)),
})

/**
 * Resposta pública da loja. Vai para `admin_reply`, que a vitrine mostra abaixo
 * do comentário — e por isso é texto puro: nada de HTML entrando por aqui.
 */
export async function replyReviewAction(reviewId: unknown, reply: unknown): Promise<ActionResult> {
  const parsed = replySchema.safeParse({ reviewId, reply })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('reviews.moderate')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const review = await loadReview(parsed.data.reviewId)
    if (!review) return { ok: false, error: 'Avaliação não encontrada.' }

    const supabase = await createClient()
    const { error } = await supabase
      .from('reviews')
      .update({ admin_reply: parsed.data.reply })
      .eq('id', parsed.data.reviewId)

    if (error) {
      console.error('[replyReviewAction]', error)
      return { ok: false, error: 'Não foi possível salvar a resposta.' }
    }

    await logAction(
      auth.user.id,
      parsed.data.reply ? 'review.reply' : 'review.reply_remove',
      parsed.data.reviewId,
      parsed.data.reply
        ? `Respondeu à avaliação de ${review.customer_name}.`
        : `Removeu a resposta da avaliação de ${review.customer_name}.`,
      { product_id: review.product_id }
    )

    revalidateReview(review.products?.slug)
    return { ok: true }
  } catch (error) {
    console.error('[replyReviewAction]', error)
    return { ok: false, error: 'Não foi possível salvar a resposta agora.' }
  }
}

// =============================================================================
// EXCLUIR
// =============================================================================
/**
 * Exclusão definitiva. Exige `reviews.delete`, que é permissão separada de
 * `reviews.moderate` justamente porque ocultar é reversível e apagar não é.
 */
export async function deleteReviewAction(reviewId: unknown): Promise<ActionResult> {
  const parsed = reviewIdSchema.safeParse(reviewId)
  if (!parsed.success) return { ok: false, error: 'Avaliação inválida.' }

  const auth = await authorize('reviews.delete')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const review = await loadReview(parsed.data)
    if (!review) return { ok: false, error: 'Avaliação não encontrada.' }

    const supabase = await createClient()
    const { error } = await supabase.from('reviews').delete().eq('id', parsed.data)

    if (error) {
      console.error('[deleteReviewAction]', error)
      return { ok: false, error: 'Não foi possível excluir a avaliação.' }
    }

    await logAction(
      auth.user.id,
      'review.delete',
      parsed.data,
      `Excluiu a avaliação de ${review.customer_name} em "${
        review.products?.name ?? 'produto removido'
      }".`,
      { product_id: review.product_id }
    )

    revalidateReview(review.products?.slug)
    return { ok: true }
  } catch (error) {
    console.error('[deleteReviewAction]', error)
    return { ok: false, error: 'Não foi possível excluir a avaliação agora.' }
  }
}
