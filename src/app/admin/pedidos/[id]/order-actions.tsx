'use client'

import * as React from 'react'
import { Ban, CheckCircle2, Loader2, RefreshCw, StickyNote } from 'lucide-react'
import { toast } from 'sonner'

import {
  addOrderNoteAction,
  cancelOrderAction,
  markOrderPaidAction,
  updateOrderStatusAction,
} from '@/actions/orders'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OrderStatus, PaymentStatus } from '@/lib/types/database.types'

/**
 * Status que o <select> oferece.
 *
 * `paid` e `cancelled` ficam FORA de propósito: os dois têm efeito colateral
 * (baixa de estoque, entrega automática, devolução de reserva) que só as RPCs
 * mark_order_paid/cancel_order sabem executar. Eles têm botão próprio, e a
 * Server Action recusa se alguém tentar chegar por aqui mesmo assim.
 */
const EDITABLE_STATUS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'processing', label: 'Processando' },
  { value: 'completed', label: 'Concluído' },
  { value: 'refunded', label: 'Reembolsado' },
]

export interface OrderActionsProps {
  orderId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  canWrite: boolean
}

/**
 * A página passa `key={status}`: depois de uma mudança de status o componente
 * remonta com o valor novo, em vez de sincronizar estado por efeito.
 */
export function OrderActions({ orderId, status, paymentStatus, canWrite }: OrderActionsProps) {
  const [nextStatus, setNextStatus] = React.useState<OrderStatus>(status)
  const [reason, setReason] = React.useState('')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  if (!canWrite) {
    return (
      <p className="text-sm text-muted-foreground">
        Você tem acesso de leitura a este pedido. Operar (pagar, cancelar, entregar) exige a
        permissão orders.write.
      </p>
    )
  }

  const isPaid = paymentStatus === 'paid'
  const isClosed = status === 'cancelled' || status === 'refunded'

  function handleMarkPaid() {
    startTransition(async () => {
      const result = await markOrderPaidAction(orderId)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível confirmar o pagamento.')
        return
      }
      toast.success('Pagamento confirmado. Estoque baixado e entregas automáticas geradas.')
    })
  }

  function handleStatus() {
    if (nextStatus === status) return
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, nextStatus)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível atualizar o status.')
        setNextStatus(status)
        return
      }
      toast.success('Status atualizado.')
    })
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelOrderAction(orderId, reason)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível cancelar o pedido.')
        return
      }
      setCancelOpen(false)
      setReason('')
      toast.success('Pedido cancelado e estoque devolvido ao pool.')
    })
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="success"
        className="w-full"
        disabled={pending || isPaid || isClosed}
        onClick={handleMarkPaid}
      >
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        {isPaid ? 'Pagamento já confirmado' : 'Marcar como pago'}
      </Button>

      {!isPaid && !isClosed && (
        <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
          Confirma o Pix conferido no extrato: baixa o estoque, entrega o que for automático e
          contabiliza o cupom. É idempotente — clicar duas vezes não entrega duas vezes.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="order-status">Status do pedido</Label>
        <div className="flex gap-2">
          <Select
            value={nextStatus}
            onValueChange={(value) => setNextStatus(value as OrderStatus)}
            disabled={pending}
          >
            <SelectTrigger id="order-status" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDITABLE_STATUS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {/* Status atual fora da lista editável (pago/cancelado) ainda
                  precisa aparecer, senão o select abriria mostrando outra coisa. */}
              {!EDITABLE_STATUS.some((option) => option.value === status) && (
                <SelectItem value={status} disabled>
                  {status}
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={handleStatus}
            disabled={pending || nextStatus === status}
          >
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Salvar
          </Button>
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={(open) => !pending && setCancelOpen(open)}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" className="w-full" disabled={isClosed}>
            <Ban />
            {isClosed ? 'Pedido encerrado' : 'Cancelar pedido'}
          </Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>
              O estoque reservado volta para o pool e o motivo entra nas notas administrativas.
              Chaves já entregues NÃO são recolhidas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Pagamento não identificado, pedido duplicado, cliente desistiu…"
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={pending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={pending || reason.trim().length < 3}
            >
              {pending && <Loader2 className="animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export interface OrderNoteFormProps {
  orderId: string
  canWrite: boolean
}

/**
 * Nota interna. O texto é ACRESCENTADO com data e autor pela Server Action —
 * o campo nasce vazio a cada envio para deixar claro que não é edição.
 */
export function OrderNoteForm({ orderId, canWrite }: OrderNoteFormProps) {
  const [note, setNote] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  if (!canWrite) return null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (note.trim().length < 2) return

    startTransition(async () => {
      const result = await addOrderNoteAction(orderId, note)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar a nota.')
        return
      }
      setNote('')
      toast.success('Nota adicionada.')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <Label htmlFor="order-note" className="sr-only">
        Nova nota
      </Label>
      <Textarea
        id="order-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Cliente pediu troca de e-mail, conferi o comprovante…"
        disabled={pending}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || note.trim().length < 2}>
        {pending ? <Loader2 className="animate-spin" /> : <StickyNote />}
        Adicionar nota
      </Button>
    </form>
  )
}
