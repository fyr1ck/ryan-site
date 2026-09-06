import type { OrderStatus, PaymentStatus } from '@/lib/types/database.types'

/** Mesmas variantes do componente Badge. */
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted'

export interface StatusMeta {
  label: string
  variant: BadgeVariant
}

/**
 * Cor por status. A escolha não é decorativa:
 *   warning     = precisa de ação humana (pendente, processando)
 *   success     = deu certo (pago, concluído)
 *   destructive = deu errado / dinheiro voltou
 *   muted       = encerrado sem drama
 */
export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  pending: { label: 'Pendente', variant: 'warning' },
  paid: { label: 'Pago', variant: 'success' },
  processing: { label: 'Processando', variant: 'default' },
  completed: { label: 'Concluído', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  refunded: { label: 'Reembolsado', variant: 'muted' },
}

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  pending: { label: 'Aguardando', variant: 'warning' },
  authorized: { label: 'Autorizado', variant: 'default' },
  paid: { label: 'Pago', variant: 'success' },
  failed: { label: 'Falhou', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'muted' },
  refunded: { label: 'Reembolsado', variant: 'muted' },
  chargeback: { label: 'Chargeback', variant: 'destructive' },
}

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = (
  Object.keys(ORDER_STATUS) as OrderStatus[]
).map((value) => ({ value, label: ORDER_STATUS[value].label }))

export function orderStatusMeta(status: string): StatusMeta {
  return ORDER_STATUS[status as OrderStatus] ?? { label: status, variant: 'muted' }
}

export function paymentStatusMeta(status: string): StatusMeta {
  return PAYMENT_STATUS[status as PaymentStatus] ?? { label: status, variant: 'muted' }
}
