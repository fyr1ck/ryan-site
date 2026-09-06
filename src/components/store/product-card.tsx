import Image from 'next/image'
import Link from 'next/link'

import { AddToCartButton } from '@/components/cart/add-to-cart-button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProductWithImages } from '@/lib/types/database.types'

import { Price } from './price'
import { RatingStars } from './rating-stars'

const FALLBACK_IMAGE = '/placeholders/product-1.svg'

/** A partir de quantas unidades o aviso de escassez deixa de ser verdade. */
const LOW_STOCK_THRESHOLD = 3

/**
 * Mesma conta de availableStock() (@/lib/queries/catalog), refeita aqui de
 * propósito: aquele módulo é 'server-only' e este card também é renderizado
 * dentro do ProductCarousel, que é Client Component. Importar de lá quebraria
 * o build do bundle do cliente.
 */
function stockLeft(product: ProductWithImages): number | null {
  if (product.stock_policy === 'unlimited') return null
  return Math.max(product.stock_quantity - product.stock_reserved, 0)
}

/** Capa = primeira imagem por posição. Sem imagem, o placeholder da loja. */
function coverImage(product: ProductWithImages): { url: string; alt: string } {
  const images = product.product_images ?? []
  if (images.length === 0) return { url: FALLBACK_IMAGE, alt: product.name }

  const first = [...images].sort((a, b) => a.position - b.position)[0]
  return { url: first?.url || FALLBACK_IMAGE, alt: first?.alt || product.name }
}

export interface ProductCardProps {
  product: ProductWithImages
  className?: string
}

/**
 * Card do catálogo.
 *
 * O card inteiro é clicável, mas o botão de compra vive FORA do <Link>: em vez
 * de embrulhar tudo no link (o que colocaria um <button> dentro de um <a> —
 * HTML inválido, e o clique no botão viraria navegação), o link fica só no
 * nome do produto e se estica por cima do card com o pseudo-elemento
 * ::after (after:absolute after:inset-0). O botão sobe com relative z-10 e
 * recebe o clique normalmente, sem precisar de preventDefault/stopPropagation.
 * Bônus de acessibilidade: o nome acessível do link é o nome do produto, não
 * um aria-label duplicado.
 */
export function ProductCard({ product, className }: ProductCardProps) {
  const stock = stockLeft(product)
  const soldOut = stock === 0
  const lowStock = stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD
  const image = coverImage(product)

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card',
        'transition duration-200 hover:border-primary hover:shadow-lg hover:shadow-primary/5',
        'focus-within:border-primary sm:hover:scale-[1.02]',
        className
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          // Os placeholders da loja são SVG e o otimizador não os aceita.
          unoptimized={image.url.endsWith('.svg')}
          className={cn(
            'object-cover transition-transform duration-300 group-hover:scale-105',
            soldOut && 'opacity-40 grayscale'
          )}
        />

        {(soldOut || lowStock) && (
          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1 sm:left-2 sm:top-2">
            {soldOut && (
              <Badge variant="destructive" className="bg-background/90 backdrop-blur-sm">
                Esgotado
              </Badge>
            )}
            {lowStock && (
              <Badge variant="warning" className="bg-background/90 backdrop-blur-sm">
                Últimas unidades
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3">
        <h3 className="text-xs font-medium leading-snug sm:text-base">
          <Link
            href={`/produto/${product.slug}`}
            className={cn(
              'line-clamp-2 rounded-sm transition-colors group-hover:text-primary',
              'after:absolute after:inset-0 after:content-[""]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
            )}
          >
            {product.name}
          </Link>
        </h3>

        <Price
          className="mt-auto pt-1"
          priceCents={product.price_cents}
          compareAtCents={product.compare_at_cents}
          size="sm"
        />

        {product.rating_count > 0 && (
          <RatingStars
            rating={product.rating_average}
            size="sm"
            showValue
            count={product.rating_count}
          />
        )}

        {/* relative z-10: fica acima do ::after do link, então o clique aqui
            compra em vez de navegar. O ícone e o texto são do
            AddToCartButton (componente compartilhado do carrinho). */}
        <AddToCartButton
          product={product}
          stock={stock}
          variant="buy"
          className="relative z-10 mt-1 h-8 rounded-md px-2 text-xs sm:h-10 sm:text-sm [&_svg]:size-3.5 sm:[&_svg]:size-4"
        />
      </div>
    </article>
  )
}
