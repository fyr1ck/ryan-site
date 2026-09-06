'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { createCouponAction, deleteCouponAction, updateCouponAction } from '@/actions/coupons'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { parsePriceToCents } from '@/lib/utils'

import { fromDateTimeLocal } from './coupon-utils'

export interface CouponFormValues {
  code: string
  description: string
  type: 'percentage' | 'fixed'
  /** Percentual ("10") ou reais ("20,00"), conforme o tipo. */
  value: string
  /** Reais. */
  minimum_order: string
  /** Reais. Vazio = sem teto. */
  maximum_discount: string
  /** Vazio = ilimitado. */
  usage_limit: string
  per_customer_limit: string
  /** Formato de <input type="datetime-local">, já no fuso da loja. */
  starts_at: string
  expires_at: string
  is_active: boolean
}

export interface CouponFormProps {
  mode: 'create' | 'edit'
  couponId?: string
  initial: CouponFormValues
  /** Quantas vezes o cupom já foi usado (só exibição, nunca editável). */
  usageCount?: number
  canDelete?: boolean
}

export const EMPTY_COUPON: CouponFormValues = {
  code: '',
  description: '',
  type: 'percentage',
  value: '',
  minimum_order: '',
  maximum_discount: '',
  usage_limit: '',
  per_customer_limit: '1',
  starts_at: '',
  expires_at: '',
  is_active: true,
}

/**
 * Formulário de cupom.
 *
 * A conversão de dinheiro acontece AQUI, e só aqui: os campos em reais viram
 * centavos (parsePriceToCents) antes de sair, e as datas viram ISO no fuso da
 * loja. O servidor revalida tudo de novo com zod — este formulário é
 * conveniência, não é a validação.
 */
export function CouponForm({ mode, couponId, initial, usageCount = 0, canDelete }: CouponFormProps) {
  const router = useRouter()
  const [values, setValues] = React.useState<CouponFormValues>(initial)
  const [pending, startTransition] = React.useTransition()

  function set<K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const isPercentage = values.type === 'percentage'

  function buildPayload() {
    return {
      code: values.code,
      description: values.description,
      type: values.type,
      // Percentual vai como número puro; valor fixo vai em REAIS, que é a
      // unidade que a RPC compute_coupon_discount espera em coupons.value.
      value: isPercentage
        ? Number(values.value.replace(',', '.'))
        : parsePriceToCents(values.value) / 100,
      minimum_order_cents:
        values.minimum_order.trim() === '' ? 0 : parsePriceToCents(values.minimum_order),
      maximum_discount_cents:
        values.maximum_discount.trim() === '' ? null : parsePriceToCents(values.maximum_discount),
      usage_limit: values.usage_limit.trim() === '' ? null : Number(values.usage_limit),
      per_customer_limit:
        values.per_customer_limit.trim() === '' ? 1 : Number(values.per_customer_limit),
      starts_at: fromDateTimeLocal(values.starts_at),
      expires_at: fromDateTimeLocal(values.expires_at),
      is_active: values.is_active,
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = buildPayload()

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createCouponAction(payload)
        if (!result.ok) {
          toast.error(result.error ?? 'Não foi possível criar o cupom.')
          return
        }
        toast.success('Cupom criado.')
        router.push('/admin/cupons')
        return
      }

      const result = await updateCouponAction(couponId, payload)
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar o cupom.')
        return
      }
      toast.success('Cupom atualizado.')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={values.code}
                // Maiúsculas no ato de digitar: a coluna é citext (não
                // diferencia caixa), mas o cliente lê o código do cupom e
                // "BEMVINDO10" comunica melhor do que "bemvindo10".
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                placeholder="BEMVINDO10"
                maxLength={40}
                required
                disabled={pending}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Letras, números, hífen e sublinhado. Sem espaços.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição interna</Label>
              <Textarea
                id="description"
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                rows={2}
                maxLength={300}
                disabled={pending}
                placeholder="Campanha de lançamento, parceria com streamer…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desconto</CardTitle>
            <CardDescription>
              Percentual é aplicado sobre o subtotal; valor fixo é abatido direto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={values.type}
                onValueChange={(value) => set('type', value as 'percentage' | 'fixed')}
                disabled={pending}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="value">{isPercentage ? 'Percentual (%)' : 'Valor (R$)'}</Label>
              <Input
                id="value"
                value={values.value}
                onChange={(event) => set('value', event.target.value)}
                inputMode="decimal"
                required
                disabled={pending}
                placeholder={isPercentage ? '10' : '20,00'}
              />
              {isPercentage && (
                <p className="text-xs text-muted-foreground">
                  Máximo de 100% — o banco recusa acima disso.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minimum_order">Pedido mínimo (R$)</Label>
              <Input
                id="minimum_order"
                value={values.minimum_order}
                onChange={(event) => set('minimum_order', event.target.value)}
                inputMode="decimal"
                disabled={pending}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maximum_discount">Desconto máximo (R$)</Label>
              <Input
                id="maximum_discount"
                value={values.maximum_discount}
                onChange={(event) => set('maximum_discount', event.target.value)}
                inputMode="decimal"
                disabled={pending}
                placeholder="Sem teto"
              />
              <p className="text-xs text-muted-foreground">
                Teto em reais para cupom percentual em carrinho grande.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limites e prazo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="usage_limit">Limite total de usos</Label>
              <Input
                id="usage_limit"
                value={values.usage_limit}
                onChange={(event) => set('usage_limit', event.target.value)}
                inputMode="numeric"
                disabled={pending}
                placeholder="Ilimitado"
              />
              {mode === 'edit' && (
                <p className="text-xs text-muted-foreground">
                  Já usado {usageCount} vez(es). Esse contador é escrito pela confirmação de
                  pagamento e não é editável aqui.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="per_customer_limit">Limite por cliente</Label>
              <Input
                id="per_customer_limit"
                value={values.per_customer_limit}
                onChange={(event) => set('per_customer_limit', event.target.value)}
                inputMode="numeric"
                disabled={pending}
                placeholder="1"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="starts_at">Início</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={values.starts_at}
                onChange={(event) => set('starts_at', event.target.value)}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expires_at">Expiração</Label>
              <Input
                id="expires_at"
                type="datetime-local"
                value={values.expires_at}
                onChange={(event) => set('expires_at', event.target.value)}
                disabled={pending}
              />
            </div>

            <p className="text-xs text-muted-foreground sm:col-span-2">
              Datas no horário de Brasília. Deixe em branco para valer sem prazo.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Publicação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="is_active" className="cursor-pointer">
                Cupom ativo
              </Label>
              <Switch
                id="is_active"
                checked={values.is_active}
                onCheckedChange={(checked) => set('is_active', checked)}
                disabled={pending}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Desativado, o cupom deixa de ser aceito no checkout na mesma hora, mas o histórico de
              quem já usou continua intacto.
            </p>

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {mode === 'create' ? 'Criar cupom' : 'Salvar alterações'}
            </Button>

            {mode === 'edit' && canDelete && couponId && (
              <ConfirmDelete
                title="Excluir cupom?"
                description="O histórico de resgates deste cupom é apagado junto (os pedidos ficam, com o código guardado). Para só parar de aceitá-lo, use o botão Cupom ativo."
                onConfirm={async () => {
                  const result = await deleteCouponAction(couponId)
                  if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir.')
                  toast.success('Cupom excluído.')
                  router.push('/admin/cupons')
                }}
                trigger={
                  <Button type="button" variant="ghost" className="w-full" disabled={pending}>
                    <Trash2 />
                    Excluir cupom
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
