'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, EyeOff, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  approveReviewAction,
  deleteReviewAction,
  hideReviewAction,
  replyReviewAction,
} from '@/actions/reviews-admin'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { RatingStars } from '@/components/store/rating-stars'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime } from '@/lib/utils'

export interface AdminReviewRow {
  id: string
  rating: number
  comment: string | null
  customer_name: string
  is_approved: boolean
  is_verified_purchase: boolean
  admin_reply: string | null
  created_at: string
  product_name: string
  product_slug: string | null
}

export interface ReviewsManagerProps {
  reviews: AdminReviewRow[]
  canModerate: boolean
  canDelete: boolean
}

/**
 * Moderação de avaliações.
 *
 * As três abas filtram a MESMA lista já carregada — trocar de aba não vai ao
 * servidor. Com o volume de uma loja pequena isso é mais rápido e não perde o
 * lugar da rolagem; se um dia a lista passar de alguns milhares, a filtragem
 * volta para a query.
 */
export function ReviewsManager({ reviews, canModerate, canDelete }: ReviewsManagerProps) {
  const pending = reviews.filter((review) => !review.is_approved)
  const approved = reviews.filter((review) => review.is_approved)

  return (
    <Tabs defaultValue="pendentes">
      <TabsList>
        <TabsTrigger value="pendentes">
          Pendentes
          {pending.length > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">
              {pending.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="aprovadas">Aprovadas ({approved.length})</TabsTrigger>
        <TabsTrigger value="todas">Todas ({reviews.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="pendentes">
        <ReviewList
          reviews={pending}
          canModerate={canModerate}
          canDelete={canDelete}
          emptyTitle="Nada na fila"
          emptyDescription="Toda avaliação nova cai aqui antes de aparecer na loja."
        />
      </TabsContent>

      <TabsContent value="aprovadas">
        <ReviewList
          reviews={approved}
          canModerate={canModerate}
          canDelete={canDelete}
          emptyTitle="Nenhuma avaliação publicada"
          emptyDescription="Aprove uma avaliação para ela contar na nota do produto."
        />
      </TabsContent>

      <TabsContent value="todas">
        <ReviewList
          reviews={reviews}
          canModerate={canModerate}
          canDelete={canDelete}
          emptyTitle="Nenhuma avaliação ainda"
          emptyDescription="Só quem comprou e pagou consegue avaliar um produto."
        />
      </TabsContent>
    </Tabs>
  )
}

function ReviewList({
  reviews,
  canModerate,
  canDelete,
  emptyTitle,
  emptyDescription,
}: {
  reviews: AdminReviewRow[]
  canModerate: boolean
  canDelete: boolean
  emptyTitle: string
  emptyDescription: string
}) {
  if (reviews.length === 0) {
    return <EmptyState icon={<MessageSquare />} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="grid gap-3">
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          canModerate={canModerate}
          canDelete={canDelete}
        />
      ))}
    </div>
  )
}

function ReviewCard({
  review,
  canModerate,
  canDelete,
}: {
  review: AdminReviewRow
  canModerate: boolean
  canDelete: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  const [replyOpen, setReplyOpen] = React.useState(false)
  const [reply, setReply] = React.useState(review.admin_reply ?? '')

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível concluir a ação.')
        return
      }
      toast.success(success)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {review.product_slug ? (
                <Link href={`/produto/${review.product_slug}`} className="hover:text-primary">
                  {review.product_name}
                </Link>
              ) : (
                review.product_name
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {review.customer_name} · {formatDateTime(review.created_at)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <RatingStars rating={review.rating} showValue />
            <Badge variant={review.is_approved ? 'success' : 'warning'}>
              {review.is_approved ? 'Publicada' : 'Pendente'}
            </Badge>
            {review.is_verified_purchase && <Badge variant="secondary">Compra verificada</Badge>}
          </div>
        </div>

        {review.comment ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{review.comment}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Nota sem comentário.</p>
        )}

        {review.admin_reply && (
          <div className="rounded-lg border-l-2 border-primary bg-muted/40 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Resposta da loja
            </p>
            <p className="whitespace-pre-wrap text-sm">{review.admin_reply}</p>
          </div>
        )}

        {(canModerate || canDelete) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {canModerate && !review.is_approved && (
              <Button
                type="button"
                size="sm"
                variant="success"
                disabled={pending}
                onClick={() => run(() => approveReviewAction(review.id), 'Avaliação publicada.')}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Aprovar
              </Button>
            )}

            {canModerate && review.is_approved && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => hideReviewAction(review.id), 'Avaliação ocultada.')}
              >
                {pending ? <Loader2 className="animate-spin" /> : <EyeOff />}
                Ocultar
              </Button>
            )}

            {canModerate && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setReplyOpen(true)}
              >
                <MessageSquare />
                {review.admin_reply ? 'Editar resposta' : 'Responder'}
              </Button>
            )}

            {canDelete && (
              <ConfirmDelete
                title="Excluir avaliação?"
                description="A avaliação some do histórico e a nota do produto é recalculada. Para apenas tirar da vitrine, use Ocultar."
                onConfirm={async () => {
                  const result = await deleteReviewAction(review.id)
                  // ConfirmDelete mantém o diálogo aberto e mostra o toast se
                  // a promise rejeitar — por isso o erro vira throw aqui.
                  if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir.')
                  toast.success('Avaliação excluída.')
                }}
                trigger={
                  <Button type="button" size="sm" variant="ghost" disabled={pending}>
                    <Trash2 />
                    Excluir
                  </Button>
                }
              />
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={replyOpen} onOpenChange={(open) => !pending && setReplyOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder avaliação</DialogTitle>
            <DialogDescription>
              A resposta aparece embaixo do comentário na página do produto, assinada como a loja.
              Texto puro — nada de HTML.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`reply-${review.id}`}>Resposta</Label>
            <Textarea
              id={`reply-${review.id}`}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={4}
              maxLength={1000}
              disabled={pending}
              placeholder="Obrigado pelo comentário! Já ajustamos…"
            />
          </div>

          <DialogFooter>
            {review.admin_reply && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setReply('')
                  run(() => replyReviewAction(review.id, ''), 'Resposta removida.')
                  setReplyOpen(false)
                }}
              >
                Remover resposta
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setReplyOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || reply.trim() === ''}
              onClick={() => {
                run(() => replyReviewAction(review.id, reply), 'Resposta publicada.')
                setReplyOpen(false)
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Salvar resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
