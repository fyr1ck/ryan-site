import { Star } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Review } from '@/lib/types/database.types'

import { RatingStars } from './rating-stars'

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>

const EMPTY_DISTRIBUTION: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

/** Conta quantas avaliações caíram em cada nota. */
export function distributionFromReviews(
  reviews: Pick<Review, 'rating'>[]
): RatingDistribution {
  const result: RatingDistribution = { ...EMPTY_DISTRIBUTION }
  for (const review of reviews) {
    const note = Math.round(review.rating)
    if (note >= 1 && note <= 5) result[note as 1 | 2 | 3 | 4 | 5] += 1
  }
  return result
}

export interface RatingSummaryProps {
  /** Média oficial do produto (products.rating_average). */
  average: number
  /** Total oficial (products.rating_count). */
  total: number
  /** Distribuição pronta; se faltar, é calculada a partir de `reviews`. */
  distribution?: RatingDistribution
  reviews?: Pick<Review, 'rating'>[]
  className?: string
}

/**
 * Bloco de avaliações do produto.
 *
 * As barras usam como base a soma da própria distribuição, não o total do
 * produto: a página carrega as avaliações mais recentes, então somar as
 * barras com o total geral daria percentuais que não fecham 100%.
 */
export function RatingSummary({
  average,
  total,
  distribution,
  reviews,
  className,
}: RatingSummaryProps) {
  const spread = distribution ?? distributionFromReviews(reviews ?? [])
  const spreadTotal = ([1, 2, 3, 4, 5] as const).reduce((sum, note) => sum + spread[note], 0)
  const safeAverage = Math.min(Math.max(Number.isFinite(average) ? average : 0, 0), 5)

  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-8 sm:p-5',
        className
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1 sm:w-40">
        <span className="text-4xl font-black leading-none sm:text-5xl">
          {safeAverage.toFixed(1).replace('.', ',')}
        </span>
        <RatingStars rating={safeAverage} size="md" />
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? 'avaliação' : 'avaliações'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {([5, 4, 3, 2, 1] as const).map((note) => {
          const count = spread[note]
          const percent = spreadTotal > 0 ? Math.round((count / spreadTotal) * 100) : 0

          return (
            <div key={note} className="flex items-center gap-2">
              <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                {note}
                <Star className="size-3 fill-current text-warning" aria-hidden />
              </span>
              <Progress
                value={percent}
                indicatorClassName="bg-warning"
                className="h-1.5 flex-1"
                aria-label={`${note} ${note === 1 ? 'estrela' : 'estrelas'}: ${percent}%`}
              />
              <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {percent}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
