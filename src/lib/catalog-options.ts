import type { SortOption } from '@/lib/queries/catalog'

/**
 * Constantes compartilhadas entre a página de catálogo (Server Component) e o
 * painel de filtros (Client Component).
 *
 * Elas moram aqui, e não no componente de filtros, porque um Server Component
 * que importa de um módulo marcado com 'use client' não recebe o valor real:
 * o Next troca os exports por referências de cliente, e no servidor o array
 * vira um proxy — `SORT_OPTIONS.map` quebra em tempo de build.
 * Módulo neutro (sem 'use client') é lido normalmente pelos dois lados.
 */

export const PRODUCTS_PATH = '/produtos'

export const SORT_OPTIONS: readonly { value: SortOption; label: string }[] = [
  { value: 'relevancia', label: 'Relevância' },
  { value: 'mais-vendidos', label: 'Mais vendidos' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
  { value: 'novidades', label: 'Novidades' },
]

export const SORT_VALUES: readonly string[] = SORT_OPTIONS.map((option) => option.value)

export const DEFAULT_SORT: SortOption = 'relevancia'
