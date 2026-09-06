import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  /** Sem href o item vira texto simples — é o caso da página atual. */
  href?: string
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  /** O "Início" entra sozinho na frente; passe false se já vier em `items`. */
  showHome?: boolean
  className?: string
}

/** Trilha de navegação de categoria, produto e páginas institucionais. */
export function Breadcrumbs({ items, showHome = true, className }: BreadcrumbsProps) {
  const trail: BreadcrumbItem[] = showHome ? [{ label: 'Início', href: '/' }, ...items] : items
  if (trail.length === 0) return null

  return (
    <nav aria-label="Você está aqui" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground sm:text-sm">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              )}

              {isLast || !item.href ? (
                <span
                  className={cn('truncate', isLast && 'font-medium text-foreground')}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="truncate rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
