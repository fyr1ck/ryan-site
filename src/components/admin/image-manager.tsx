'use client'

import * as React from 'react'
import NextImage from 'next/image'
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Star, Trash2 } from 'lucide-react'

import { ImageUpload } from '@/components/admin/image-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface ManagedImage {
  /** Chave estável do arrasto. Não vai para o banco. */
  id: string
  url: string
  alt: string | null
}

export interface ImageManagerProps {
  value: ManagedImage[]
  onChange: (images: ManagedImage[]) => void
  bucket?: string
  folder?: string
  max?: number
  disabled?: boolean
  className?: string
}

/** id local só para o dnd-kit — o banco identifica a imagem pela posição. */
export function createManagedImage(url: string, alt: string | null = null): ManagedImage {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${url}-${Date.now()}`,
    url,
    alt,
  }
}

interface SortableImageProps {
  image: ManagedImage
  index: number
  disabled: boolean
  onAltChange: (alt: string) => void
  onRemove: () => void
}

function SortableImage({ image, index, disabled, onAltChange, onRemove }: SortableImageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled,
  })

  const isCover = index === 0

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border border-border bg-card p-2',
        isDragging && 'z-10 border-primary opacity-90 shadow-lg'
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
        <NextImage
          src={image.url}
          alt={image.alt ?? `Imagem ${index + 1} do produto`}
          fill
          sizes="(max-width: 640px) 50vw, 240px"
          unoptimized={image.url.endsWith('.svg')}
          className="object-cover"
        />

        {isCover && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-primary backdrop-blur-sm">
            <Star className="size-3" />
            Capa
          </span>
        )}

        {/* O punho é o único ponto que inicia o arrasto: assim o campo de texto
            e o botão de excluir continuam clicáveis dentro do card. */}
        <button
          type="button"
          aria-label={`Reordenar imagem ${index + 1}`}
          disabled={disabled}
          className={cn(
            'absolute right-1.5 top-1.5 grid size-7 cursor-grab place-items-center rounded-md',
            'bg-background/90 text-muted-foreground backdrop-blur-sm transition-colors',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50'
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`alt-${image.id}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Texto alternativo
        </Label>
        <Input
          id={`alt-${image.id}`}
          value={image.alt ?? ''}
          onChange={(event) => onAltChange(event.target.value)}
          disabled={disabled}
          maxLength={200}
          placeholder="Conta com Leopard Fruit"
          className="h-9 text-sm"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        className="justify-center text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 />
        Remover
      </Button>
    </li>
  )
}

/**
 * Galeria do produto: envia, reordena por arrasto e escreve o texto
 * alternativo de cada imagem.
 *
 * A PRIMEIRA imagem é a capa — é ela que a vitrine mostra no card e que o
 * checkout guarda no snapshot do pedido. Por isso a ordem é dado, não enfeite,
 * e o arrasto precisa persistir junto com o resto do formulário.
 */
export function ImageManager({
  value,
  onChange,
  bucket = 'product-images',
  folder = 'produtos',
  max = 20,
  disabled = false,
  className,
}: ImageManagerProps) {
  const sensors = useSensors(
    // 6px de tolerância: sem isso, um toque no punho já contaria como arrasto
    // e o clique de foco no celular viraria reordenação acidental.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const full = value.length >= max

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = value.findIndex((image) => image.id === active.id)
    const to = value.findIndex((image) => image.id === over.id)
    if (from < 0 || to < 0) return

    onChange(arrayMove(value, from, to))
  }

  return (
    <div className={cn('space-y-3', className)}>
      {value.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={value.map((image) => image.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {value.map((image, index) => (
                <SortableImage
                  key={image.id}
                  image={image}
                  index={index}
                  disabled={disabled}
                  onAltChange={(alt) =>
                    onChange(
                      value.map((item) =>
                        item.id === image.id ? { ...item, alt: alt || null } : item
                      )
                    )
                  }
                  onRemove={() => onChange(value.filter((item) => item.id !== image.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {full ? (
        <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-4 text-center text-sm text-muted-foreground">
          Limite de {max} imagens atingido. Remova uma para enviar outra.
        </p>
      ) : (
        <ImageUpload
          bucket={bucket}
          folder={folder}
          value={null}
          disabled={disabled}
          onChange={(url) => {
            if (!url) return
            onChange([...value, createManagedImage(url)])
          }}
          hint={
            value.length === 0
              ? 'A primeira imagem enviada vira a capa do produto.'
              : `${value.length} de ${max} imagens. Arraste pelo punho para reordenar.`
          }
        />
      )}
    </div>
  )
}
