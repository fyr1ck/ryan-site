'use client'

import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCart } from './cart-provider'

/**
 * Botão do header. A contagem só entra depois da hidratação — o servidor não
 * conhece o localStorage e um número aqui no HTML inicial quebraria o match.
 */
export function CartButton({ className }: { className?: string }) {
  const { itemCount, toggleCart, isHydrated } = useCart()
  const showBadge = isHydrated && itemCount > 0

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleCart}
      className={cn('relative', className)}
      aria-label={
        showBadge
          ? `Carrinho: ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`
          : 'Abrir carrinho'
      }
    >
      <ShoppingCart />
      {showBadge && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground tabular-nums"
          aria-hidden
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Button>
  )
}
