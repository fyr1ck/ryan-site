import { PackageSearch } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { ProductWithImages } from '@/lib/types/database.types'

import { ProductCard } from './product-card'

export interface ProductGridProps {
  products: ProductWithImages[]
  /** Texto do estado vazio — muda entre busca, categoria e coleção. */
  emptyMessage?: string
  className?: string
}

/** Grade padrão do catálogo: 2 colunas no celular, 4 no desktop. */
export function ProductGrid({ products, emptyMessage, className }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch />}
        title="Nenhum produto por aqui"
        description={emptyMessage ?? 'Tente outra busca ou veja as outras categorias da loja.'}
      />
    )
  }

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
