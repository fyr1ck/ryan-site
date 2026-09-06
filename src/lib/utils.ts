import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Dinheiro no banco é inteiro em centavos. Aqui vira "R$ 69,90". */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

/** Percentual de desconto arredondado, como o cliente espera ver. */
export function discountPercent(priceCents: number, compareAtCents: number | null): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100)
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** "há 3 horas", "há 2 dias" — usado nas avaliações. */
export function timeAgo(value: string | Date): string {
  const date = new Date(value)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  for (const [unit, secondsInUnit] of units) {
    const amount = Math.floor(seconds / secondsInUnit)
    if (amount >= 1) return rtf.format(-amount, unit)
  }
  return 'agora mesmo'
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Converte "69,90" ou "69.90" do formulário para 6990 centavos. */
export function parsePriceToCents(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100)
  const normalized = input.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** Centavos para o valor que aparece no input do admin ("69,90"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
