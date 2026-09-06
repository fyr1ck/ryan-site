'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn, formatPrice } from '@/lib/utils'
import { useCart } from './cart-provider'
import type { CartItem } from '@/lib/types/database.types'

export function CartDrawer() {
  const { items, isOpen, isHydrated, itemCount, subtotalCents, openCart, closeCart } = useCart()

  const isEmpty = items.length === 0

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? openCart() : closeCart())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>
            Carrinho
            {isHydrated && itemCount > 0 && (
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Itens selecionados para compra. O valor final é conferido no checkout.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4">
          {isEmpty ? (
            <EmptyCart onNavigate={closeCart} />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.product_id}>
                  <CartRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isEmpty && (
          <SheetFooter className="flex-col gap-3 border-t border-border px-4 py-4 sm:flex-col sm:justify-start">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Valor total:</span>
              <span className="text-xl font-bold text-foreground">
                {formatPrice(subtotalCents)}
              </span>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href="/checkout" onClick={closeCart}>
                Ir para a compra
              </Link>
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

function EmptyCart({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <ShoppingCart className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">Seu carrinho está vazio</p>
        <p className="text-sm text-muted-foreground">
          Escolha um produto para continuar a compra.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/produtos" onClick={onNavigate}>
          Ver produtos
        </Link>
      </Button>
    </div>
  )
}

function CartRow({ item }: { item: CartItem }) {
  const { removeItem, updateQuantity } = useCart()

  const canDecrease = item.quantity > 1
  const canIncrease = item.quantity < item.max_quantity

  return (
    <div className="flex gap-3 py-4">
      <div className="shrink-0">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={64}
            height={64}
            className="size-16 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border border-border bg-muted">
            <ShoppingCart className="size-5 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium text-foreground">{item.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatPrice(item.price_cents)} cada
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(item.product_id)}
            aria-label={`Remover ${item.name} do carrinho`}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              disabled={!canDecrease}
              onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
              aria-label="Diminuir quantidade"
            >
              <Minus />
            </Button>
            <span
              className="min-w-7 text-center text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              disabled={!canIncrease}
              onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
              aria-label="Aumentar quantidade"
            >
              <Plus />
            </Button>
          </div>

          <span
            className={cn(
              'text-sm font-semibold text-foreground tabular-nums',
              item.quantity > 1 && 'text-primary'
            )}
          >
            {formatPrice(item.price_cents * item.quantity)}
          </span>
        </div>

        {!canIncrease && item.max_quantity < 99 && (
          <p className="text-xs text-muted-foreground">
            Máximo disponível: {item.max_quantity}
          </p>
        )}
      </div>
    </div>
  )
}
