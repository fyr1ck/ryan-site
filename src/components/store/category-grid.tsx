import { LayoutGrid } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/types/database.types'

import { CategoryCard } from './category-card'

export interface CategoryGridProps {
  categories: Pick<Category, 'id' | 'name' | 'slug' | 'image_url'>[]
  emptyMessage?: string
  className?: string
}

/** 3 colunas no celular, subindo até 7 no desktop largo. */
export function CategoryGrid({ categories, emptyMessage, className }: CategoryGridProps) {
  if (categories.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid />}
        title="Nenhuma categoria disponível"
        description={emptyMessage ?? 'As categorias aparecem aqui assim que forem publicadas.'}
      />
    )
  }

  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7',
        className
      )}
    >
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </div>
  )
}
