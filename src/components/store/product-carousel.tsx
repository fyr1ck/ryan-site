'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProductWithImages } from '@/lib/types/database.types'

import { ProductCard } from './product-card'

export interface ProductCarouselProps {
  title: string
  subtitle?: string
  products: ProductWithImages[]
  /** Link do "Ver todos" — sem ele o link não aparece. */
  viewAllHref?: string
  viewAllLabel?: string
  className?: string
}

/**
 * Carrossel das seções da home.
 *
 * Sem biblioteca: é a classe .snap-row (grid + scroll-snap) do globals.css.
 * No mobile o dedo arrasta e as setas somem; do sm: para cima as setas rolam
 * uma "página" por clique e se desabilitam nas pontas.
 *
 * A largura do slide vive em grid-auto-columns e não no filho: .snap-row é
 * um grid de colunas automáticas, e uma largura em % dentro de uma coluna
 * auto resolveria contra a própria largura do conteúdo — o card encolheria.
 * Os valores são os mesmos: 45% no mobile, 31% no sm:, 23% no lg:.
 */
export function ProductCarousel({
  title,
  subtitle,
  products,
  viewAllHref,
  viewAllLabel = 'Ver todos',
  className,
}: ProductCarouselProps) {
  const trackRef = React.useRef<HTMLUListElement>(null)
  const headingId = React.useId()
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(true)

  const syncEdges = React.useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const max = track.scrollWidth - track.clientWidth
    setAtStart(track.scrollLeft <= 4)
    setAtEnd(track.scrollLeft >= max - 4)
  }, [])

  React.useEffect(() => {
    syncEdges()
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return

    // Fonte carregada, imagem entrando, janela mudando de tamanho: o fim da
    // trilha muda de lugar e as setas precisam acompanhar.
    const observer = new ResizeObserver(syncEdges)
    observer.observe(track)
    return () => observer.disconnect()
  }, [syncEdges, products.length])

  const scrollPage = React.useCallback((direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    track.scrollBy({
      left: direction * track.clientWidth * 0.85,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [])

  if (products.length === 0) return null

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby={headingId}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-base font-bold sm:text-xl">
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {viewAllHref && (
            <Button asChild variant="link" size="sm" className="px-1 sm:px-2">
              <Link href={viewAllHref}>{viewAllLabel}</Link>
            </Button>
          )}

          {/* No mobile o gesto já resolve; as setas só existem do sm: para cima. */}
          <div className="hidden items-center gap-1 sm:flex">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => scrollPage(-1)}
              disabled={atStart}
              aria-label={`Ver itens anteriores de ${title}`}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => scrollPage(1)}
              disabled={atEnd}
              aria-label={`Ver mais itens de ${title}`}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={syncEdges}
        className="snap-row [grid-auto-columns:45%] sm:[grid-auto-columns:31%] lg:[grid-auto-columns:23%]"
      >
        {products.map((product) => (
          <li key={product.id} className="w-full shrink-0">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  )
}
