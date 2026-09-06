import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AdminPaginationProps {
  page: number
  totalPages: number
  total: number
  /** Rota base, ex.: '/admin/pedidos'. */
  basePath: string
  /** Filtros ativos que precisam sobreviver à troca de página. */
  params?: Record<string, string | undefined>
  /** Nome do que está sendo contado: "pedidos", "clientes", "registros". */
  itemLabel?: string
  pageParam?: string
}

/**
 * Paginação por LINK, não por estado de cliente.
 *
 * Assim a página continua sendo Server Component: o filtro e a página moram na
 * URL, o back do navegador funciona, e o admin consegue mandar o link da
 * página 3 filtrada para outra pessoa.
 */
export function AdminPagination({
  page,
  totalPages,
  total,
  basePath,
  params = {},
  itemLabel = 'registros',
  pageParam = 'pagina',
}: AdminPaginationProps) {
  function hrefFor(target: number): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, value)
    }
    if (target > 1) search.set(pageParam, String(target))

    const query = search.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString('pt-BR')} {itemLabel}
        {totalPages > 1 && ` · página ${page} de ${totalPages}`}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {/* Link desabilitado vira <span>: link para lugar nenhum confunde
              leitor de tela e ainda aparece no teclado como parada inútil. */}
          {hasPrev ? (
            <Link
              href={hrefFor(page - 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              rel="prev"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </span>
          )}

          {hasNext ? (
            <Link
              href={hrefFor(page + 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              rel="next"
            >
              Próxima
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}
            >
              Próxima
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
