import { ProductCardSkeleton, Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto da home.
 *
 * Repete a estrutura real — hero, faixa de categorias e um carrossel — nas
 * mesmas proporções e no mesmo espaçamento das seções verdadeiras, para que
 * a troca do esqueleto pelo conteúdo não empurre a página.
 */
export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      {/* hero */}
      <section className="container-store pt-4 pb-10 sm:pt-6 sm:pb-14">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl md:aspect-[4/1]" />
      </section>

      {/* categorias */}
      <section className="container-store py-10 sm:py-14">
        <Skeleton className="mb-5 h-7 w-52" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      </section>

      {/* carrossel de produtos */}
      <section className="container-store py-10 sm:py-14">
        <div className="mb-3 flex items-end justify-between gap-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  )
}
