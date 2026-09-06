import { ProductGridSkeleton, Skeleton } from '@/components/ui/skeleton'

/** Esqueleto do catálogo: coluna de filtros no desktop, grade de produtos. */
export default function ProdutosLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="container-store py-6 sm:py-8">
      <span className="sr-only">Carregando os produtos…</span>

      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-40" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 flex-1 min-w-56 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-60 shrink-0 space-y-6 lg:block">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-4/6" />
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <ProductGridSkeleton count={12} />
        </div>
      </div>
    </div>
  )
}
