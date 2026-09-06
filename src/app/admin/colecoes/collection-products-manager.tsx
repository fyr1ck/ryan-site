'use client'

import * as React from 'react'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Loader2, Package, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { searchProductsForCollection, setCollectionProducts } from '@/actions/collections'
import type { CollectionProductOption } from '@/actions/catalog-shared'
import { cn, formatPrice } from '@/lib/utils'

const FALLBACK_IMAGE = '/placeholders/product-1.svg'

function StatusBadge({ status }: { status: CollectionProductOption['status'] }) {
  if (status === 'active') return null
  return (
    <Badge variant={status === 'draft' ? 'warning' : 'muted'}>
      {status === 'draft' ? 'Rascunho' : 'Arquivado'}
    </Badge>
  )
}

function Thumb({ url, className }: { url: string | null; className?: string }) {
  const src = url ?? FALLBACK_IMAGE
  return (
    <span className={cn('relative size-10 shrink-0 overflow-hidden rounded-md bg-muted', className)}>
      <NextImage
        src={src}
        alt=""
        fill
        sizes="40px"
        unoptimized={src.endsWith('.svg')}
        className="object-cover"
      />
    </span>
  )
}

interface SortableProductProps {
  product: CollectionProductOption
  index: number
  disabled: boolean
  onRemove: () => void
}

function SortableProduct({ product, index, disabled, onRemove }: SortableProductProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-card p-2 sm:gap-3',
        isDragging && 'z-10 border-primary opacity-90 shadow-lg'
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar ${product.name}`}
        disabled={disabled}
        className="grid size-8 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      <Thumb url={product.image_url} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{product.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatPrice(product.price_cents)}
        </span>
      </span>

      <StatusBadge status={product.status} />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={disabled}
        title="Remover da coleção"
        aria-label={`Remover ${product.name} da coleção`}
        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <X />
      </Button>
    </li>
  )
}

export interface CollectionProductsManagerProps {
  collectionId: string
  initial: CollectionProductOption[]
  canWrite: boolean
}

/**
 * Produtos da coleção: busca, adiciona, remove e reordena.
 *
 * Cada mudança salva na hora — a lista aqui é uma ordem, e ordem meio salva
 * não existe. Se a action falhar, o estado local volta ao que estava antes, e
 * não fica um "salvo" que o banco nunca viu.
 */
export function CollectionProductsManager({
  collectionId,
  initial,
  canWrite,
}: CollectionProductsManagerProps) {
  const router = useRouter()

  const [items, setItems] = React.useState<CollectionProductOption[]>(initial)
  const [term, setTerm] = React.useState('')
  // O termo viaja junto com o resultado: é o que diferencia "ainda buscando"
  // de "achei nada", sem um segundo estado para manter em sincronia.
  const [results, setResults] = React.useState<{
    term: string
    items: CollectionProductOption[]
  }>({ term: '', items: [] })
  const [saving, setSaving] = React.useState(false)

  const query = term.trim()
  const searching = query.length >= 2 && results.term !== query

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Busca com pausa de 350 ms: sem isso seria uma consulta por tecla digitada.
  React.useEffect(() => {
    if (!canWrite || query.length < 2) return

    let cancelled = false

    const timer = setTimeout(async () => {
      const result = await searchProductsForCollection({ term: query })
      if (cancelled) return

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível buscar produtos.')
        // Grava o termo mesmo no erro: sem isso o spinner giraria para sempre.
        setResults({ term: query, items: [] })
        return
      }
      setResults({ term: query, items: result.products })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, canWrite])

  async function save(next: CollectionProductOption[], previous: CollectionProductOption[]) {
    setSaving(true)
    try {
      const result = await setCollectionProducts({
        collection_id: collectionId,
        product_ids: next.map((product) => product.id),
      })

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar os produtos da coleção.')
        setItems(previous)
        return
      }

      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  function handleAdd(product: CollectionProductOption) {
    if (items.some((item) => item.id === product.id)) return
    const previous = items
    const next = [...items, product]
    setItems(next)
    void save(next, previous)
  }

  function handleRemove(productId: string) {
    const previous = items
    const next = items.filter((item) => item.id !== productId)
    setItems(next)
    void save(next, previous)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = items.findIndex((item) => item.id === active.id)
    const to = items.findIndex((item) => item.id === over.id)
    if (from < 0 || to < 0) return

    const previous = items
    const next = arrayMove(items, from, to)
    setItems(next)
    void save(next, previous)
  }

  const available =
    results.term === query && query.length >= 2
      ? results.items.filter((product) => !items.some((item) => item.id === product.id))
      : []
  const disabled = !canWrite || saving

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                // Este campo vive dentro do <form> da coleção: sem o preventDefault,
                // Enter salvaria a coleção em vez de só filtrar a busca.
                if (event.key === 'Enter') event.preventDefault()
              }}
              placeholder="Buscar produto pelo nome…"
              aria-label="Buscar produto para adicionar à coleção"
              className="pl-9 pr-9"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {query.length >= 2 && !searching && available.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              Nenhum produto novo encontrado para “{query}”.
            </p>
          )}

          {available.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-card/40 p-2">
              {available.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-accent sm:gap-3"
                >
                  <Thumb url={product.image_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatPrice(product.price_cents)}
                    </span>
                  </span>
                  <StatusBadge status={product.status} />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => handleAdd(product)}
                    className="shrink-0"
                  >
                    <Plus />
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Nenhum produto nesta coleção"
          description={
            canWrite
              ? 'Busque acima para adicionar. A ordem daqui é a ordem que aparece na loja.'
              : 'Você não tem permissão para editar esta coleção.'
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {items.map((product, index) => (
                <SortableProduct
                  key={product.id}
                  product={product}
                  index={index}
                  disabled={disabled}
                  onRemove={() => handleRemove(product.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-xs text-muted-foreground">
        {saving ? 'Salvando a ordem…' : 'Cada alteração é salva automaticamente.'}
      </p>
    </div>
  )
}
