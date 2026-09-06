'use client'

import * as React from 'react'
import { BadgeCheck, ChevronDown, MessageSquare } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, initials, timeAgo } from '@/lib/utils'
import type { Review } from '@/lib/types/database.types'

import { RatingStars } from './rating-stars'

export interface ReviewListProps {
  reviews: Review[]
  /** Quantas aparecem antes de o cliente clicar em "Ver mais avaliações". */
  initialCount?: number
  emptyMessage?: string
  className?: string
}

/**
 * Lista de avaliações do produto.
 *
 * Client Component só por causa do "ver mais": as avaliações já vêm
 * renderizadas do servidor, o clique apenas revela o resto que já está no
 * HTML — nada de segunda requisição.
 */
export function ReviewList({
  reviews,
  initialCount = 3,
  emptyMessage,
  className,
}: ReviewListProps) {
  const [expanded, setExpanded] = React.useState(false)

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="Ainda sem avaliações"
        description={emptyMessage ?? 'Compre e seja o primeiro a avaliar este produto.'}
      />
    )
  }

  const visible = expanded ? reviews : reviews.slice(0, initialCount)
  const hidden = reviews.length - visible.length

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-col gap-3">
        {visible.map((review) => (
          <li key={review.id}>
            <ReviewItem review={review} />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setExpanded(true)}
          className="w-full sm:w-auto sm:self-center"
        >
          <ChevronDown aria-hidden />
          Ver mais avaliações ({hidden})
        </Button>
      )}
    </div>
  )
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback>{initials(review.customer_name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold">{review.customer_name}</span>
            {review.is_verified_purchase && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                <BadgeCheck className="size-3.5" aria-hidden />
                Compra verificada
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingStars rating={review.rating} size="sm" />
            {/* O texto relativo muda com o relógio: sem isso, o React acusa
                diferença entre o HTML do servidor e o do cliente. */}
            <time
              dateTime={review.created_at}
              className="text-[11px] text-muted-foreground"
              suppressHydrationWarning
            >
              {timeAgo(review.created_at)}
            </time>
          </div>

          {review.comment && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {review.comment}
            </p>
          )}

          {review.admin_reply && (
            <div className="mt-3 rounded-lg border-l-2 border-primary bg-muted/50 p-2.5">
              <p className="text-xs font-semibold text-foreground">Resposta da loja</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {review.admin_reply}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
