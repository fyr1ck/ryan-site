'use client'

import * as React from 'react'
import { Check, Copy, Eye, EyeOff, Loader2, PackageCheck, Send } from 'lucide-react'
import { toast } from 'sonner'

import { deliverManuallyAction, revealDeliveryAction } from '@/actions/orders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/utils'

export interface DeliveryView {
  id: string
  /** Só a máscara chega ao navegador. O conteúdo real vem da Server Action. */
  masked: string
  contentTypeLabel: string
  deliveredAt: string
  viewCount: number
  source: 'manual' | 'stock'
}

export interface DeliveryItemView {
  orderItemId: string
  productName: string
  quantity: number
  deliveryType: 'automatic' | 'manual'
  deliveries: DeliveryView[]
}

export interface DeliveryPanelProps {
  items: DeliveryItemView[]
  canWrite: boolean
  isPaid: boolean
}

/**
 * Painel de entrega.
 *
 * REGRA DE OURO desta tela: o conteúdo digital NÃO viaja junto com o HTML.
 * A página manda "DEMO-••••-3"; apertar "Revelar" chama revealDeliveryAction(),
 * que devolve o valor e grava a visualização em admin_logs. Se a máscara fosse
 * só CSS, qualquer um com o "ver código-fonte" leria o estoque inteiro.
 */
export function DeliveryPanel({ items, canWrite, isPaid }: DeliveryPanelProps) {
  if (items.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-4 text-primary" />
          Entrega
        </CardTitle>
        <CardDescription>
          Conteúdo digital fica mascarado por padrão. Cada revelação é registrada nos logs com o seu
          usuário.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {items.map((item) => (
          <DeliveryItem key={item.orderItemId} item={item} canWrite={canWrite} isPaid={isPaid} />
        ))}
      </CardContent>
    </Card>
  )
}

function DeliveryItem({
  item,
  canWrite,
  isPaid,
}: {
  item: DeliveryItemView
  canWrite: boolean
  isPaid: boolean
}) {
  const isManual = item.deliveryType === 'manual'
  const pending = isManual && item.deliveries.length === 0

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.productName}</p>
          <p className="text-xs text-muted-foreground">
            {item.quantity} unidade{item.quantity > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={isManual ? 'warning' : 'secondary'}>
            {isManual ? 'Entrega manual' : 'Entrega automática'}
          </Badge>
          {pending && <Badge variant="destructive">Pendente</Badge>}
        </div>
      </div>

      {item.deliveries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {item.deliveries.map((delivery) => (
            <li key={delivery.id}>
              <SecretRow delivery={delivery} />
            </li>
          ))}
        </ul>
      )}

      {item.deliveries.length === 0 && !isManual && (
        <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
          {isPaid
            ? 'Nada registrado para este item. É o esperado em produto de estoque ilimitado — a entrega automática só gera conteúdo quando o produto usa chaves.'
            : 'A entrega automática acontece assim que o pagamento for confirmado.'}
        </p>
      )}

      {isManual && canWrite && <ManualDeliveryForm item={item} />}

      {isManual && !canWrite && item.deliveries.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Você não tem a permissão orders.write para registrar a entrega.
        </p>
      )}
    </div>
  )
}

/** Linha de um conteúdo entregue: mascarado, com revelar e copiar. */
function SecretRow({ delivery }: { delivery: DeliveryView }) {
  const [content, setContent] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [copied, setCopied] = React.useState(false)

  function handleReveal() {
    if (content !== null) {
      setContent(null)
      return
    }
    startTransition(async () => {
      const result = await revealDeliveryAction(delivery.id)
      if (!result.ok || !result.content) {
        toast.error(result.error ?? 'Não foi possível revelar o conteúdo.')
        return
      }
      setContent(result.content)
    })
  }

  async function handleCopy() {
    if (content === null) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('O navegador bloqueou a cópia. Selecione o texto manualmente.')
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">
          {content ?? delivery.masked}
        </code>

        <div className="flex shrink-0 items-center gap-1">
          {content !== null && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleCopy} aria-label="Copiar conteúdo">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReveal}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : content !== null ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
            {content !== null ? 'Ocultar' : 'Revelar'}
          </Button>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {delivery.source === 'manual' ? 'Escrito pelo admin' : 'Chave do estoque'} ·{' '}
        {delivery.contentTypeLabel} · entregue em {formatDateTime(delivery.deliveredAt)} ·{' '}
        {delivery.viewCount} visualização{delivery.viewCount === 1 ? '' : 'ões'} pelo cliente
      </p>
    </div>
  )
}

/** Campo onde o admin escreve o que vai ser entregue ao cliente. */
function ManualDeliveryForm({ item }: { item: DeliveryItemView }) {
  const [content, setContent] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const alreadyDelivered = item.deliveries.length > 0
  const fieldId = `entrega-${item.orderItemId}`

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (content.trim() === '') return

    startTransition(async () => {
      const result = await deliverManuallyAction(item.orderItemId, content)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível registrar a entrega.')
        return
      }
      setContent('')
      toast.success('Entrega registrada. O cliente já consegue ver o conteúdo.')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <Label htmlFor={fieldId} className="text-xs">
        {alreadyDelivered ? 'Registrar outra entrega' : 'Conteúdo a entregar'}
      </Label>
      <Textarea
        id={fieldId}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={pending}
        rows={3}
        maxLength={5000}
        placeholder="Código, login e senha, link de download…"
        className="font-mono text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          O cliente vê isto na página do pedido dele assim que você salvar.
        </p>
        <Button type="submit" size="sm" disabled={pending || content.trim() === ''}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Entregar
        </Button>
      </div>
    </form>
  )
}
