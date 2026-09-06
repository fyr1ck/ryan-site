'use client'

import * as React from 'react'
import Image from 'next/image'

import { cn } from '@/lib/utils'

const FALLBACK_IMAGE = '/placeholders/product-1.svg'

export interface GalleryImage {
  id?: string
  url: string
  alt?: string | null
}

export interface ProductGalleryProps {
  images: GalleryImage[]
  /** Usado como alt quando a imagem não tem texto alternativo cadastrado. */
  productName: string
  className?: string
}

/**
 * Galeria da página do produto.
 *
 * Client Component pelo mínimo necessário: trocar qual imagem está grande.
 * As miniaturas só aparecem quando existe mais de uma imagem — uma fileira
 * com um item só é ruído.
 *
 * O índice ativo é recortado (`Math.min`) em vez de guardado com useEffect:
 * se o cliente estava na 4ª foto e navega para outro produto que tem 2, o
 * componente pode ser reaproveitado pelo React e o índice antigo apontaria
 * para o vazio.
 */
export function ProductGallery({ images, productName, className }: ProductGalleryProps) {
  const [selected, setSelected] = React.useState(0)

  const list: GalleryImage[] =
    images.length > 0 ? images : [{ url: FALLBACK_IMAGE, alt: productName }]

  const index = Math.min(selected, list.length - 1)
  const active = list[index]
  const activeAlt = active.alt || productName

  return (
    <div className={cn('flex flex-col gap-2 sm:gap-3', className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
        <Image
          key={active.url}
          src={active.url}
          alt={activeAlt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          // Os placeholders da loja são SVG e o otimizador do Next não os aceita.
          unoptimized={active.url.endsWith('.svg')}
          className="object-cover"
        />
      </div>

      {list.length > 1 && (
        <ul className="snap-row [grid-auto-columns:22%] sm:[grid-auto-columns:16%] lg:[grid-auto-columns:19%]">
          {list.map((image, position) => {
            const isActive = position === index

            return (
              <li key={image.id ?? `${image.url}-${position}`}>
                <button
                  type="button"
                  onClick={() => setSelected(position)}
                  aria-label={`Ver imagem ${position + 1} de ${list.length}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'relative block aspect-video w-full overflow-hidden rounded-lg border bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                      ? 'border-primary'
                      : 'border-border opacity-70 hover:border-primary/50 hover:opacity-100'
                  )}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 22vw, 12vw"
                    unoptimized={image.url.endsWith('.svg')}
                    className="object-cover"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
