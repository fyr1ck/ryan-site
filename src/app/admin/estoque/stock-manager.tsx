'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Copy, Eye, EyeOff, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  addStockItemsAction,
  deleteStockItemAction,
  revealStockItemAction,
  toggleStockItemAction,
  updateManualStockAction,
} from '@/actions/inventory'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import type { DigitalContentType, StockItemStatus } from '@/lib/types/database.types'

import type { BadgeVariant } from '../pedidos/order-status'

const ALL = 'todos'

const STATUS_META: Record<StockItemStatus, { label: string; variant: BadgeVariant }> = {
  available: { label: 'Disponível', variant: 'success' },
  reserved: { label: 'Reservada', variant: 'warning' },
  delivered: { label: 'Entregue', variant: 'muted' },
  disabled: { label: 'Desabilitada', variant: 'destructive' },
}

const CONTENT_TYPES: { value: DigitalContentType; label: string }[] = [
  { value: 'code', label: 'Código / chave' },
  { value: 'link', label: 'Link' },
  { value: 'credential', label: 'Login e senha' },
  { value: 'file', label: 'Arquivo' },
  { value: 'text', label: 'Texto livre' },
]

export interface StockProductOption {
  id: string
  name: string
  stockPolicy: 'unlimited' | 'manual' | 'digital_keys'
  stockQuantity: number
  stockReserved: number
}

export interface StockItemView {
  id: string
  /** Só a máscara. O conteúdo real vem de revealStockItemAction(). */
  masked: string
  contentTypeLabel: string
  status: StockItemStatus
  note: string | null
  createdAt: string
}

export interface StockManagerProps {
  products: StockProductOption[]
  selectedId: string | null
  items: StockItemView[]
  canWrite: boolean
}

export function StockManager({ products, selectedId, items, canWrite }: StockManagerProps) {
  const router = useRouter()
  const selected = products.find((product) => product.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="produto">Produto</Label>
        <Select
          value={selectedId ?? ALL}
          onValueChange={(value) =>
            router.push(value === ALL ? '/admin/estoque' : `/admin/estoque?produto=${value}`)
          }
        >
          <SelectTrigger id="produto" className="sm:max-w-md">
            <SelectValue placeholder="Todos os produtos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os produtos</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected?.stockPolicy === 'manual' && canWrite && (
        <ManualStockCard key={`${selected.id}:${selected.stockQuantity}`} product={selected} />
      )}

      {selected?.stockPolicy === 'digital_keys' && canWrite && <AddKeysCard product={selected} />}

      {!selected && canWrite && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Escolha um produto acima para cadastrar chaves ou ajustar a quantidade.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Chaves cadastradas</CardTitle>
          <CardDescription>
            O conteúdo fica mascarado. Cada revelação é registrada nos logs com o seu usuário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              title="Nenhuma chave aqui"
              description={
                selected
                  ? 'Este produto ainda não tem chaves cadastradas.'
                  : 'Nenhuma chave cadastrada na loja ainda.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <StockRow item={item} canWrite={canWrite} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Quantidade contada à mão (stock_policy = 'manual').
 *
 * Recebe `key` com a quantidade atual: depois de salvar, o componente remonta
 * já com o número que veio do banco.
 */
function ManualStockCard({ product }: { product: StockProductOption }) {
  const [quantity, setQuantity] = React.useState(String(product.stockQuantity))
  const [pending, startTransition] = React.useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(quantity)
    if (!Number.isInteger(value) || value < 0) {
      toast.error('Informe um número inteiro.')
      return
    }

    startTransition(async () => {
      const result = await updateManualStockAction({ productId: product.id, quantity: value })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível atualizar a quantidade.')
        return
      }
      toast.success('Quantidade atualizada.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estoque manual</CardTitle>
        <CardDescription>
          Este produto conta unidades, não chaves. Disponível para venda ={' '}
          {Math.max(product.stockQuantity - product.stockReserved, 0)} (
          {product.stockQuantity} em estoque − {product.stockReserved} reservadas).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-32 flex-1 space-y-1.5">
            <Label htmlFor="stock-quantity">Quantidade em estoque</Label>
            <Input
              id="stock-quantity"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          As unidades reservadas não são editáveis aqui: quem as move é o checkout, dentro da
          transação do pedido.
        </p>
      </CardContent>
    </Card>
  )
}

/** Cadastro em lote: uma chave por linha. */
function AddKeysCard({ product }: { product: StockProductOption }) {
  const [raw, setRaw] = React.useState('')
  const [contentType, setContentType] = React.useState<DigitalContentType>('code')
  const [note, setNote] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const lineCount = raw.split(/\r?\n/).filter((line) => line.trim() !== '').length

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lineCount === 0) return

    startTransition(async () => {
      const result = await addStockItemsAction({
        productId: product.id,
        contentType,
        raw,
        note: note.trim() === '' ? null : note,
      })

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar as chaves.')
        return
      }

      setRaw('')
      setNote('')
      toast.success(
        result.duplicates
          ? `${result.added} chave(s) adicionada(s). ${result.duplicates} linha(s) repetida(s) foram ignoradas.`
          : `${result.added} chave(s) adicionada(s).`
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar chaves</CardTitle>
        <CardDescription>Uma por linha. Linhas repetidas no mesmo lote são ignoradas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="content-type">Tipo de conteúdo</Label>
              <Select
                value={contentType}
                onValueChange={(value) => setContentType(value as DigitalContentType)}
                disabled={pending}
              >
                <SelectTrigger id="content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stock-note">Observação do lote</Label>
              <Input
                id="stock-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={200}
                disabled={pending}
                placeholder="Lote do fornecedor X, compra de 12/09…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stock-raw">Chaves</Label>
            <Textarea
              id="stock-raw"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={6}
              disabled={pending}
              className="font-mono text-sm"
              placeholder={'DEMO-1111-A\nDEMO-2222-B\nDEMO-3333-C'}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {lineCount} linha{lineCount === 1 ? '' : 's'} preenchida
              {lineCount === 1 ? '' : 's'} · máximo de 500 por lote
            </p>
            <Button type="submit" disabled={pending || lineCount === 0}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar ao estoque
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Uma chave da listagem: mascarada, com revelar / desabilitar / excluir. */
function StockRow({ item, canWrite }: { item: StockItemView; canWrite: boolean }) {
  const [content, setContent] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const meta = STATUS_META[item.status]
  const isAvailable = item.status === 'available'
  const isDisabled = item.status === 'disabled'

  function handleReveal() {
    if (content !== null) {
      setContent(null)
      return
    }
    startTransition(async () => {
      const result = await revealStockItemAction(item.id)
      if (!result.ok || !result.content) {
        toast.error(result.error ?? 'Não foi possível revelar a chave.')
        return
      }
      setContent(result.content)
    })
  }

  async function handleCopy() {
    if (content === null) return
    try {
      await navigator.clipboard.writeText(content)
      toast.success('Copiado.')
    } catch {
      toast.error('O navegador bloqueou a cópia.')
    }
  }

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleStockItemAction(item.id, isAvailable)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível atualizar a chave.')
        return
      }
      toast.success(isAvailable ? 'Chave desabilitada.' : 'Chave reabilitada.')
    })
  }

  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">{content ?? item.masked}</code>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Badge variant={meta.variant}>{meta.label}</Badge>

          {content !== null && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleCopy} aria-label="Copiar">
              <Copy className="size-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleReveal}
            disabled={pending}
            aria-label={content !== null ? 'Ocultar conteúdo' : 'Revelar conteúdo'}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : content !== null ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>

          {canWrite && (isAvailable || isDisabled) && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleToggle}
              disabled={pending}
              aria-label={isAvailable ? 'Desabilitar chave' : 'Reabilitar chave'}
            >
              {isAvailable ? <Ban className="size-4" /> : <RotateCcw className="size-4" />}
            </Button>
          )}

          {canWrite && (isAvailable || isDisabled) && (
            <ConfirmDelete
              title="Excluir esta chave?"
              description="A chave some do estoque para sempre. Se ela só veio errada do fornecedor, prefira desabilitar."
              onConfirm={async () => {
                const result = await deleteStockItemAction(item.id)
                if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir.')
                toast.success('Chave excluída.')
              }}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label="Excluir chave"
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          )}
        </div>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        {item.contentTypeLabel} · cadastrada em {formatDateTime(item.createdAt)}
        {item.note ? ` · ${item.note}` : ''}
      </p>
    </div>
  )
}
