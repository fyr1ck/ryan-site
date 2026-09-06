'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Minus, Package, Plus, ShieldCheck, ShoppingCart, Trash2, Zap } from 'lucide-react'

import { useCart } from '@/components/cart/cart-provider'
import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatPrice } from '@/lib/utils'
import type { CartItem } from '@/lib/types/database.types'

/**
 * Página cheia do carrinho.
 *
 * O arquivo inteiro é client porque o carrinho vive no localStorage — não há
 * nada para renderizar no servidor além do esqueleto. O preço mostrado aqui é
 * o do storage: quem cobra é a RPC create_order, que relê tudo do banco.
 */
export default function CarrinhoPage() {
  const { items, isHydrated, itemCount, subtotalCents } = useCart()

  return (
    <div className="container-store py-6 sm:py-8">
      <Breadcrumbs items={[{ label: 'Carrinho' }]} className="mb-4" />

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Seu carrinho
          </h1>
          {isHydrated && items.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {itemCount} {itemCount === 1 ? 'item selecionado' : 'itens selecionados'}
            </p>
          )}
        </div>

        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/produtos">
            <ArrowLeft />
            Continuar comprando
          </Link>
        </Button>
      </header>

      {!isHydrated ? (
        <CartLoading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart />}
          title="Seu carrinho está vazio"
          description="Escolha um produto do catálogo para começar a sua compra."
          action={
            <Button asChild>
              <Link href="/produtos">Ver produtos</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.product_id}>
                  <CartRow item={item} />
                </li>
              ))}
            </ul>
          </Card>

          <CartSummary subtotalCents={subtotalCents} itemCount={itemCount} />
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------

function CartLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Card className="divide-y divide-border">
        {[0, 1].map((index) => (
          <div key={index} className="flex gap-3 p-4">
            <Skeleton className="size-20 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function CartRow({ item }: { item: CartItem }) {
  const { removeItem, updateQuantity } = useCart()

  const canDecrease = item.quantity > 1
  const canIncrease = item.quantity < item.max_quantity
  const lineTotal = item.price_cents * item.quantity

  return (
    <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
      <Link
        href={item.slug ? `/produto/${item.slug}` : '/produtos'}
        className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir ${item.name}`}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={96}
            height={96}
            className="size-20 rounded-md border border-border object-cover sm:size-24"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-md border border-border bg-muted sm:size-24">
            <Package className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={item.slug ? `/produto/${item.slug}` : '/produtos'}
              className="line-clamp-2 text-sm font-medium text-foreground transition-colors hover:text-primary sm:text-base"
            >
              {item.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              disabled={!canDecrease}
              onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
              aria-label={`Diminuir quantidade de ${item.name}`}
            >
              <Minus />
            </Button>
            <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              disabled={!canIncrease}
              onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
              aria-label={`Aumentar quantidade de ${item.name}`}
            >
              <Plus />
            </Button>
          </div>

          <span
            className={cn(
              'text-base font-bold tabular-nums text-foreground',
              item.quantity > 1 && 'text-primary'
            )}
          >
            {formatPrice(lineTotal)}
          </span>
        </div>

        {!canIncrease && item.max_quantity < 99 && (
          <p className="text-xs text-muted-foreground">
            Máximo disponível em estoque: {item.max_quantity}
          </p>
        )}
      </div>
    </div>
  )
}

function CartSummary({ subtotalCents, itemCount }: { subtotalCents: number; itemCount: number }) {
  return (
    <Card className="lg:sticky lg:top-24">
      <CardContent className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-foreground">Resumo</h2>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {formatPrice(subtotalCents)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Cupom de desconto é aplicado na próxima etapa.
          </p>
        </div>

        <Separator />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            {formatPrice(subtotalCents)}
          </span>
        </div>

        <Button asChild size="lg" className="w-full">
          <Link href="/checkout">Finalizar compra</Link>
        </Button>

        <Button asChild variant="outline" className="w-full sm:hidden">
          <Link href="/produtos">Continuar comprando</Link>
        </Button>

        <ul className="space-y-2 pt-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Zap className="size-3.5 text-primary" aria-hidden />
            Entrega digital imediata após a confirmação do Pix.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Pagamento processado em ambiente seguro.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
