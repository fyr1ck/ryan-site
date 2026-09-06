import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Estrelas de avaliação com preenchimento parcial.
 *
 * Em vez de arredondar 4,3 para 4 estrelas, desenha duas fileiras sobrepostas
 * — a cinza por baixo, a colorida por cima recortada na largura da média.
 * Assim 4,3 e 4,9 não viram a mesma coisa aos olhos do cliente.
 */

export type RatingStarsSize = 'sm' | 'md'

const ICON_SIZE: Record<RatingStarsSize, string> = {
  sm: 'size-3',
  md: 'size-4',
}

const VALUE_SIZE: Record<RatingStarsSize, string> = {
  sm: 'text-[11px]',
  md: 'text-sm',
}

export interface RatingStarsProps {
  /** Média de 0 a 5. Valores fora da faixa são cortados. */
  rating: number
  size?: RatingStarsSize
  /** Mostra a média em número ao lado das estrelas. */
  showValue?: boolean
  /** Total de avaliações — sai como "(12)" depois da média. */
  count?: number
  className?: string
}

function Row({ size, filled }: { size: RatingStarsSize; filled: boolean }) {
  return (
    <span className="flex gap-px" aria-hidden>
      {[0, 1, 2, 3, 4].map((index) => (
        <Star
          key={index}
          className={cn(ICON_SIZE[size], 'shrink-0', filled && 'fill-current')}
          strokeWidth={filled ? 1.5 : 2}
        />
      ))}
    </span>
  )
}

export function RatingStars({
  rating,
  size = 'sm',
  showValue = false,
  count,
  className,
}: RatingStarsProps) {
  const safe = Math.min(Math.max(Number.isFinite(rating) ? rating : 0, 0), 5)
  const percent = (safe / 5) * 100

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={`${safe.toFixed(1).replace('.', ',')} de 5 estrelas${
        count !== undefined ? ` em ${count} avaliações` : ''
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <span className="text-muted-foreground/40">
          <Row size={size} filled={false} />
        </span>
        {/* Recorte da fileira colorida: overflow-hidden + largura da média. */}
        <span
          className="absolute inset-y-0 left-0 overflow-hidden text-warning"
          style={{ width: `${percent}%` }}
        >
          <Row size={size} filled />
        </span>
      </span>

      {(showValue || count !== undefined) && (
        <span className={cn('leading-none text-muted-foreground', VALUE_SIZE[size])}>
          {showValue && (
            <span className="font-semibold text-foreground">
              {safe.toFixed(1).replace('.', ',')}
            </span>
          )}
          {count !== undefined && <span className={cn(showValue && 'ml-1')}>({count})</span>}
        </span>
      )}
    </span>
  )
}
