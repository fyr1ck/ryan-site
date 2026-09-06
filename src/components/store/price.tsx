import { TrendingDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn, discountPercent, formatPrice } from '@/lib/utils'

/**
 * Bloco de preço da loja inteira: card do grid, página do produto, carrinho.
 *
 * As três variações mudam só a tipografia — a ordem (preço antigo riscado +
 * desconto, preço atual, "À vista no Pix") é sempre a mesma para o cliente
 * não precisar reaprender a ler o preço a cada tela.
 */

export type PriceSize = 'sm' | 'md' | 'lg'

const SIZES: Record<PriceSize, { current: string; compare: string; note: string }> = {
  /** Card do grid: pequeno no mobile, cresce a partir do sm. */
  sm: { current: 'text-sm sm:text-lg', compare: 'text-xs', note: 'text-xs' },
  /** Linha de carrinho, checkout, blocos secundários. */
  md: { current: 'text-lg sm:text-xl', compare: 'text-sm', note: 'text-xs' },
  /** Página do produto. */
  lg: { current: 'text-2xl sm:text-3xl', compare: 'text-sm sm:text-base', note: 'text-sm' },
}

export interface PriceProps {
  priceCents: number
  compareAtCents?: number | null
  size?: PriceSize
  /** A linha "À vista no Pix" não faz sentido dentro do carrinho, por exemplo. */
  showPix?: boolean
  className?: string
}

export function Price({
  priceCents,
  compareAtCents = null,
  size = 'md',
  showPix = true,
  className,
}: PriceProps) {
  const styles = SIZES[size]
  const discount = discountPercent(priceCents, compareAtCents)
  const hasDiscount = discount !== null && compareAtCents !== null

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {hasDiscount && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-muted-foreground line-through', styles.compare)}>
            {formatPrice(compareAtCents)}
          </span>
          <Badge variant="success" className="gap-0.5 px-1.5 py-0 text-[10px] leading-4">
            <TrendingDown className="size-3" aria-hidden />
            {`-${discount}% OFF`}
          </Badge>
        </div>
      )}

      <span className={cn('font-bold leading-tight text-foreground', styles.current)}>
        {formatPrice(priceCents)}
      </span>

      {showPix && (
        <span className={cn('leading-tight text-muted-foreground', styles.note)}>
          À vista no Pix
        </span>
      )}
    </div>
  )
}
