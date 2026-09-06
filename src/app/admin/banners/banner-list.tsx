'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
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
import { ExternalLink, GripVertical, ImageOff, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteBannerAction,
  reorderBannersAction,
  toggleBannerActiveAction,
} from '@/actions/banners'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { cn, formatDateTime } from '@/lib/utils'
import type { Banner, BannerPlacement } from '@/lib/types/database.types'

import { PLACEMENT_LABEL, PLACEMENT_ORDER } from './banner-form'

export interface BannerListProps {
  banners: Banner[]
  canWrite: boolean
  canDelete: boolean
  /**
   * "Agora" calculado no servidor. Passado como prop de propósito: usar
   * Date.now() no render faria o HTML do servidor e o da hidratação
   * discordarem sobre o que está agendado ou expirado.
   */
  nowIso: string
}

type Status = { label: string; variant: 'success' | 'muted' | 'warning' | 'destructive' }

function statusOf(banner: Banner, now: number): Status {
  if (!banner.is_active) return { label: 'Inativo', variant: 'muted' }
  if (banner.starts_at && new Date(banner.starts_at).getTime() > now) {
    return { label: 'Agendado', variant: 'warning' }
  }
  if (banner.ends_at && new Date(banner.ends_at).getTime() < now) {
    return { label: 'Expirado', variant: 'destructive' }
  }
  return { label: 'No ar', variant: 'success' }
}

function windowLabel(banner: Banner): string {
  if (!banner.starts_at && !banner.ends_at) return 'Sem janela de datas'
  if (banner.starts_at && !banner.ends_at) return `A partir de ${formatDateTime(banner.starts_at)}`
  if (!banner.starts_at && banner.ends_at) return `Até ${formatDateTime(banner.ends_at)}`
  return `${formatDateTime(banner.starts_at as string)} → ${formatDateTime(banner.ends_at as string)}`
}

interface RowProps {
  banner: Banner
  now: number
  canWrite: boolean
  canDelete: boolean
  onToggle: (banner: Banner, next: boolean) => void
  onDelete: (banner: Banner) => Promise<void>
}

function BannerRow({ banner, now, canWrite, canDelete, onToggle, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
    disabled: !canWrite,
  })

  const status = statusOf(banner, now)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-card p-3',
        isDragging && 'z-10 border-primary/50 shadow-lg'
      )}
    >
      {canWrite && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${banner.title}`}
          className="mt-1 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:w-32">
        {banner.image_url ? (
          <Image
            src={banner.image_url}
            alt=""
            fill
            sizes="128px"
            className="object-cover"
            unoptimized={banner.image_url.endsWith('.svg')}
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-4" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{banner.title}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <p className="text-xs text-muted-foreground">{PLACEMENT_LABEL[banner.placement]}</p>
        <p className="text-xs text-muted-foreground">{windowLabel(banner)}</p>

        {banner.link_url && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{banner.link_url}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={banner.is_active}
              disabled={!canWrite}
              onCheckedChange={(next) => onToggle(banner, next)}
              aria-label={`${banner.is_active ? 'Desativar' : 'Ativar'} ${banner.title}`}
            />
            Ativo
          </label>

          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/banners/${banner.id}`}>
              <Pencil />
              Editar
            </Link>
          </Button>

          {canDelete && (
            <ConfirmDelete
              onConfirm={() => onDelete(banner)}
              title={`Excluir "${banner.title}"?`}
              description="O banner sai da loja na hora. A imagem continua no storage."
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 />
                  Excluir
                </Button>
              }
            />
          )}
        </div>
      </div>
    </li>
  )
}

export function BannerList({ banners, canWrite, canDelete, nowIso }: BannerListProps) {
  // Cópia local para o arrastar responder na hora; o servidor confirma depois.
  const [items, setItems] = React.useState(banners)

  // Ressincroniza durante o render (padrão "ajustar estado quando a prop muda")
  // em vez de num efeito: assim o React já renderiza com a lista nova, sem o
  // frame intermediário mostrando a lista velha.
  const [syncedFrom, setSyncedFrom] = React.useState(banners)
  if (banners !== syncedFrom) {
    setSyncedFrom(banners)
    setItems(banners)
  }

  const now = React.useMemo(() => new Date(nowIso).getTime(), [nowIso])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const groups = React.useMemo(
    () =>
      PLACEMENT_ORDER.map((placement) => ({
        placement,
        rows: items.filter((banner) => banner.placement === placement),
      })),
    [items]
  )

  async function handleDragEnd(event: DragEndEvent, placement: BannerPlacement) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const group = items.filter((banner) => banner.placement === placement)
    const from = group.findIndex((banner) => banner.id === active.id)
    const to = group.findIndex((banner) => banner.id === over.id)
    if (from < 0 || to < 0) return

    const reordered = arrayMove(group, from, to)
    const previous = items

    // Reconstrói a lista inteira mantendo os outros posicionamentos intactos.
    const byId = new Map(reordered.map((banner, index) => [banner.id, index]))
    setItems(
      items
        .map((banner) =>
          banner.placement === placement
            ? { ...banner, position: byId.get(banner.id) ?? banner.position }
            : banner
        )
        .sort((a, b) => a.position - b.position)
    )

    const result = await reorderBannersAction({ ids: reordered.map((banner) => banner.id) })
    if (!result.ok) {
      setItems(previous)
      toast.error(result.error ?? 'Não foi possível salvar a nova ordem.')
      return
    }
    toast.success('Ordem salva.')
  }

  async function handleToggle(banner: Banner, next: boolean) {
    const previous = items
    setItems((current) =>
      current.map((row) => (row.id === banner.id ? { ...row, is_active: next } : row))
    )

    const result = await toggleBannerActiveAction({ id: banner.id, is_active: next })
    if (!result.ok) {
      setItems(previous)
      toast.error(result.error ?? 'Não foi possível alterar o banner.')
      return
    }
    toast.success(next ? 'Banner ativado.' : 'Banner desativado.')
  }

  async function handleDelete(banner: Banner) {
    const result = await deleteBannerAction({ id: banner.id })
    // Lança para o ConfirmDelete manter o diálogo aberto e mostrar o erro.
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir o banner.')

    setItems((current) => current.filter((row) => row.id !== banner.id))
    toast.success('Banner excluído.')
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff />}
        title="Nenhum banner cadastrado"
        description="Crie o primeiro banner para ocupar o topo da home."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/admin/banners/novo">Novo banner</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="grid gap-6">
      {groups.map(({ placement, rows }) => (
        <section key={placement} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{PLACEMENT_LABEL[placement]}</h2>
            <span className="text-xs text-muted-foreground">
              {rows.length === 0
                ? 'Nenhum banner'
                : `${rows.length} banner${rows.length > 1 ? 's' : ''}`}
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              Nada aqui ainda.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void handleDragEnd(event, placement)}
            >
              <SortableContext
                items={rows.map((banner) => banner.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="grid gap-2">
                  {rows.map((banner) => (
                    <BannerRow
                      key={banner.id}
                      banner={banner}
                      now={now}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      onToggle={(target, next) => void handleToggle(target, next)}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      ))}

      {canWrite && (
        <p className="text-xs text-muted-foreground">
          Arraste pela alça à esquerda para mudar a ordem dentro de cada posicionamento. A nova ordem
          é salva automaticamente.
        </p>
      )}
    </div>
  )
}
