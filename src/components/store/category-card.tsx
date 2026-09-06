import Image from 'next/image'
import Link from 'next/link'

import { cn, initials } from '@/lib/utils'
import type { Category } from '@/lib/types/database.types'

export interface CategoryCardProps {
  category: Pick<Category, 'name' | 'slug' | 'image_url'>
  className?: string
}

/**
 * Atalho de categoria da home.
 *
 * Sem imagem cadastrada, o card cai numa tile com as iniciais em vez de
 * apontar para um arquivo que talvez não exista — placeholder quebrado no
 * next/image vira erro de request, não um quadrado cinza.
 */
export function CategoryCard({ category, className }: CategoryCardProps) {
  const image = category.image_url

  return (
    <Link
      href={`/categoria/${category.slug}`}
      className={cn(
        'group relative block overflow-hidden rounded-xl border border-border bg-card',
        'transition-colors hover:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 14vw"
            unoptimized={image.endsWith('.svg')}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xl font-black text-muted-foreground">
            {initials(category.name)}
          </div>
        )}

        {/* Escurece a arte para o nome ficar legível sobre qualquer imagem. */}
        <div className="absolute inset-0 bg-background/60 transition-colors group-hover:bg-background/45" />

        <div className="absolute inset-0 flex items-center justify-center p-1.5 sm:p-2">
          <span className="line-clamp-3 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-foreground sm:text-xs">
            {category.name}
          </span>
        </div>
      </div>
    </Link>
  )
}
