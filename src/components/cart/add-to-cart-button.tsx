'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShoppingCart, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProductWithImages } from '@/lib/types/database.types'
import { useCart, type CartItemInput } from './cart-provider'

const NO_STOCK_LIMIT = 99

export interface AddToCartButtonProps {
  product: ProductWithImages
  /** null = estoque ilimitado (o que availableStock() devolve nesse caso). */
  stock: number | null
  variant?: 'buy' | 'add'
  className?: string
}

/** A capa do produto: primeira imagem por posição. */
function coverUrl(product: ProductWithImages): string | null {
  const images = product.product_images ?? []
  if (images.length === 0) return null
  return [...images].sort((a, b) => a.position - b.position)[0]?.url ?? null
}

export function AddToCartButton({
  product,
  stock,
  variant = 'add',
  className,
}: AddToCartButtonProps) {
  const { addItem, openCart } = useCart()
  const router = useRouter()
  const [isNavigating, setIsNavigating] = React.useState(false)

  const soldOut = stock === 0

  function buildItem(): CartItemInput {
    return {
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      price_cents: product.price_cents,
      compare_at_cents: product.compare_at_cents,
      image_url: coverUrl(product),
      // O preço e o estoque daqui são só para exibição: create_order()
      // recalcula tudo no servidor antes de cobrar.
      max_quantity: stock ?? NO_STOCK_LIMIT,
    }
  }

  function handleClick() {
    if (soldOut) return

    addItem(buildItem(), 1)

    if (variant === 'buy') {
      setIsNavigating(true)
      router.push('/checkout')
      return
    }

    toast.success('Adicionado ao carrinho', { description: product.name })
    openCart()
  }

  if (soldOut) {
    return (
      <Button
        disabled
        variant={variant === 'buy' ? 'default' : 'secondary'}
        size="lg"
        className={cn('w-full', className)}
      >
        Esgotado
      </Button>
    )
  }

  const isBuy = variant === 'buy'

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isNavigating}
      variant={isBuy ? 'default' : 'secondary'}
      size="lg"
      className={cn('w-full', className)}
    >
      {isNavigating ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : isBuy ? (
        <Zap aria-hidden />
      ) : (
        <ShoppingCart aria-hidden />
      )}
      {isBuy ? 'Comprar agora' : 'Adicionar ao carrinho'}
    </Button>
  )
}
