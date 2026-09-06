import type { BadgeVariant } from '../pedidos/order-status'

/**
 * FUSO DA LOJA.
 *
 * O <input type="datetime-local"> não tem fuso: ele devolve "2026-09-01T10:00"
 * e pronto. Se o servidor interpretasse isso no fuso DELE (UTC na Vercel), um
 * cupom marcado para as 10h começaria a valer às 7h para o lojista.
 *
 * Por isso os dois lados desta conversão fixam America/Sao_Paulo. O offset é
 * constante desde 2019, quando o horário de verão acabou no Brasil — se voltar,
 * este −03:00 é o ponto único a corrigir.
 */
const STORE_OFFSET = '-03:00'
const STORE_TIMEZONE = 'America/Sao_Paulo'

/** sv-SE formata como "2026-09-01 10:00", que é quase o formato do input. */
const localFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** ISO do banco → valor de <input type="datetime-local">, no fuso da loja. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return localFormatter.format(date).replace(' ', 'T')
}

/** Valor do input → ISO em UTC, assumindo que o admin digitou no fuso da loja. */
export function fromDateTimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  const date = new Date(`${trimmed}:00${STORE_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export interface CouponStatusInput {
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
  usage_limit: number | null
  usage_count: number
}

/**
 * Situação do cupom em uma etiqueta só.
 *
 * Calculada no SERVIDOR e passada pronta para a tabela: se o cliente
 * recalculasse com o relógio dele, um cupom que expira agora poderia render
 * "Ativo" no HTML e "Expirado" depois da hidratação.
 */
export function couponStatus(coupon: CouponStatusInput): { label: string; variant: BadgeVariant } {
  if (!coupon.is_active) return { label: 'Inativo', variant: 'muted' }

  const now = Date.now()

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now) {
    return { label: 'Expirado', variant: 'destructive' }
  }
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    return { label: 'Agendado', variant: 'warning' }
  }
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    return { label: 'Esgotado', variant: 'muted' }
  }

  return { label: 'Ativo', variant: 'success' }
}
