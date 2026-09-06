import { ProductCardSkeleton, Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto da página de produto.
 *
 * Repete a divisão real — galeria à esquerda, bloco de compra à direita — nas
 * mesmas proporções, para que a chegada do conteúdo não empurre o botão de
 * comprar para baixo do dedo de quem já ia clicar.
 */
export default function ProdutoLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="container-store py-6 sm:py-8">
      <span className="sr-only">Carregando o produto…</span>

      {/* breadcrumbs */}
      <div className="mb-5 flex items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* galeria */}
        <div className="space-y-3">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="size-16 rounded-lg" />
            ))}
          </div>
        </div>

        {/* bloco de compra */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-4/5" />
          <div className="flex gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-4 w-full" />

          <div className="space-y-3 rounded-xl border border-border p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* descrição */}
      <div className="mt-12 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* relacionados */}
      <div className="mt-12">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
