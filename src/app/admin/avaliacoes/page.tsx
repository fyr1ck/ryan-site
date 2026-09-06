import type { Metadata } from 'next'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { PermissionNotice } from '../permission-notice'
import { ReviewsManager, type AdminReviewRow } from './reviews-manager'

export const metadata: Metadata = { title: 'Avaliações' }

/** Teto de carregamento. Acima disso a moderação vira outro problema. */
const LIMIT = 300

interface ReviewJoinRow {
  id: string
  rating: number
  comment: string | null
  customer_name: string
  is_approved: boolean
  is_verified_purchase: boolean
  admin_reply: string | null
  created_at: string
  products: { name: string; slug: string } | null
}

export default async function AdminReviewsPage() {
  const user = await getSessionUser()
  if (!can(user, 'reviews.read')) {
    return (
      <>
        <PageHeader title="Avaliações" />
        <PermissionNotice permission="reviews.read" what="as avaliações" />
      </>
    )
  }

  const supabase = await createClient()

  const [{ data, error }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('reviews')
      .select(
        'id, rating, comment, customer_name, is_approved, is_verified_purchase, admin_reply, created_at, products(name, slug)'
      )
      // Pendentes primeiro: é a única aba que exige ação.
      .order('is_approved', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    // Contagem real, independente do teto de LIMIT acima.
    supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('is_approved', false),
  ])

  if (error) console.error('[AdminReviewsPage]', error)

  const rows: AdminReviewRow[] = ((data ?? []) as unknown as ReviewJoinRow[]).map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    customer_name: review.customer_name,
    is_approved: review.is_approved,
    is_verified_purchase: review.is_verified_purchase,
    admin_reply: review.admin_reply,
    created_at: review.created_at,
    product_name: review.products?.name ?? 'Produto removido',
    product_slug: review.products?.slug ?? null,
  }))

  const pending = pendingCount ?? rows.filter((row) => !row.is_approved).length

  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Toda avaliação nasce oculta e só entra na nota do produto depois de aprovada aqui."
      >
        {pending > 0 && (
          <Badge variant="warning">
            {pending} pendente{pending > 1 ? 's' : ''}
          </Badge>
        )}
      </PageHeader>

      <ReviewsManager
        reviews={rows}
        canModerate={can(user, 'reviews.moderate')}
        canDelete={can(user, 'reviews.delete')}
      />
    </>
  )
}
