'use client'

import * as React from 'react'
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
import {
  BadgeCheck,
  FileText,
  FolderTree,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  createSectionAction,
  deleteSectionAction,
  reorderSectionsAction,
  toggleSectionActiveAction,
  updateSectionAction,
  type FaqItem,
  type FeatureItem,
} from '@/actions/homepage'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { HomepageSection, Json, SectionType } from '@/lib/types/database.types'

// =============================================================================
// Editor visual da home.
//
// A ordem no banco é `position`; aqui ela é o índice do array. Arrastar salva
// TODAS as seções de uma vez (position = índice) em vez de tentar remendar só
// as duas que se moveram — é o único jeito de a lista nunca ficar com posições
// duplicadas ou com buracos.
// =============================================================================

export interface OptionRow {
  id: string
  name: string
}

export interface HomepageEditorProps {
  sections: HomepageSection[]
  collections: OptionRow[]
  categories: OptionRow[]
  canWrite: boolean
}

interface SectionMeta {
  label: string
  icon: LucideIcon
  description: string
}

const SECTION_META: Record<SectionType, SectionMeta> = {
  hero: {
    label: 'Destaque principal',
    icon: Sparkles,
    description: 'Carrossel com os banners do posicionamento "Topo da home".',
  },
  banner: {
    label: 'Faixa de banner',
    icon: ImageIcon,
    description: 'Faixa com os banners do posicionamento "Meio da home".',
  },
  categories: {
    label: 'Categorias',
    icon: FolderTree,
    description: 'Grade com as categorias marcadas para aparecer na home.',
  },
  collection: {
    label: 'Coleção',
    icon: Layers,
    description: 'Carrossel com os produtos de uma coleção.',
  },
  products: {
    label: 'Produtos',
    icon: Package,
    description: 'Carrossel com os produtos de uma categoria.',
  },
  features: {
    label: 'Diferenciais',
    icon: BadgeCheck,
    description: 'Blocos curtos de ícone + texto (entrega, suporte, segurança).',
  },
  faq: {
    label: 'Perguntas frequentes',
    icon: HelpCircle,
    description: 'Lista de perguntas e respostas em acordeão.',
  },
  reviews: {
    label: 'Avaliações',
    icon: Star,
    description: 'Depoimentos recentes já aprovados na moderação.',
  },
  cta: {
    label: 'Chamada para ação',
    icon: Megaphone,
    description: 'Bloco com título, texto e um botão.',
  },
  text: {
    label: 'Texto livre',
    icon: FileText,
    description: 'Bloco de HTML editado aqui no painel.',
  },
}

const SECTION_ORDER: SectionType[] = [
  'hero',
  'banner',
  'categories',
  'collection',
  'products',
  'features',
  'reviews',
  'faq',
  'cta',
  'text',
]

/** Ícones sugeridos para os itens de "Diferenciais" — nomes do lucide-react. */
const FEATURE_ICONS = ['Zap', 'ShieldCheck', 'Headphones', 'Truck', 'Sparkles', 'CreditCard', 'Clock', 'Gift']

// ---------------------------------------------------------------------------
// Leitura do config (Json) sem confiar no formato
// ---------------------------------------------------------------------------

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readFeatureItems(config: Json): FeatureItem[] {
  const items = asRecord(config).items
  if (!Array.isArray(items)) return []
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>
    return {
      icon: typeof item.icon === 'string' ? item.icon : 'Sparkles',
      title: typeof item.title === 'string' ? item.title : '',
      text: typeof item.text === 'string' ? item.text : '',
    }
  })
}

function readFaqItems(config: Json): FaqItem[] {
  const items = asRecord(config).items
  if (!Array.isArray(items)) return []
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>
    return {
      question: typeof item.question === 'string' ? item.question : '',
      answer: typeof item.answer === 'string' ? item.answer : '',
    }
  })
}

function readHtml(config: Json): string {
  const html = asRecord(config).html
  return typeof html === 'string' ? html : ''
}

// ---------------------------------------------------------------------------
// Estado do formulário
// ---------------------------------------------------------------------------

interface SectionDraft {
  type: SectionType
  title: string
  subtitle: string
  link_url: string
  link_label: string
  collection_id: string
  category_id: string
  product_limit: number
  is_active: boolean
  features: FeatureItem[]
  faq: FaqItem[]
  html: string
}

const NONE = 'none'

function draftFromSection(section: HomepageSection): SectionDraft {
  return {
    type: section.type,
    title: section.title ?? '',
    subtitle: section.subtitle ?? '',
    link_url: section.link_url ?? '',
    link_label: section.link_label ?? '',
    collection_id: section.collection_id ?? NONE,
    category_id: section.category_id ?? NONE,
    product_limit: section.product_limit,
    is_active: section.is_active,
    features: readFeatureItems(section.config),
    faq: readFaqItems(section.config),
    html: readHtml(section.config),
  }
}

function emptyDraft(type: SectionType): SectionDraft {
  return {
    type,
    title: SECTION_META[type].label,
    subtitle: '',
    link_url: '',
    link_label: '',
    collection_id: NONE,
    category_id: NONE,
    product_limit: 8,
    is_active: true,
    features: [],
    faq: [],
    html: '',
  }
}

/** Resumo de uma linha para o card da listagem. */
function summarize(
  section: HomepageSection,
  collections: OptionRow[],
  categories: OptionRow[]
): string {
  switch (section.type) {
    case 'collection': {
      const name = collections.find((row) => row.id === section.collection_id)?.name
      return name
        ? `Coleção "${name}" · até ${section.product_limit} produtos`
        : 'Nenhuma coleção escolhida ainda'
    }
    case 'products': {
      const name = categories.find((row) => row.id === section.category_id)?.name
      return name
        ? `Categoria "${name}" · até ${section.product_limit} produtos`
        : 'Nenhuma categoria escolhida ainda'
    }
    case 'reviews':
      return `Até ${section.product_limit} depoimentos aprovados`
    case 'features': {
      const total = readFeatureItems(section.config).length
      return total === 0 ? 'Nenhum item cadastrado' : `${total} item(ns)`
    }
    case 'faq': {
      const total = readFaqItems(section.config).length
      return total === 0 ? 'Nenhuma pergunta cadastrada' : `${total} pergunta(s)`
    }
    case 'cta':
      return section.link_url ? `Botão para ${section.link_url}` : 'Sem link no botão'
    case 'text': {
      const length = readHtml(section.config).length
      return length === 0 ? 'Bloco vazio' : `${length} caracteres de HTML`
    }
    default:
      return SECTION_META[section.type].description
  }
}

// ---------------------------------------------------------------------------
// Diálogo de edição
// ---------------------------------------------------------------------------

interface SectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = criando uma seção nova. */
  section: HomepageSection | null
  initialType: SectionType
  collections: OptionRow[]
  categories: OptionRow[]
  onSaved: () => void
}

function SectionDialog({
  open,
  onOpenChange,
  section,
  initialType,
  collections,
  categories,
  onSaved,
}: SectionDialogProps) {
  const [draft, setDraft] = React.useState<SectionDraft>(() =>
    section ? draftFromSection(section) : emptyDraft(initialType)
  )
  const [pending, setPending] = React.useState(false)

  const type = draft.type
  const meta = SECTION_META[type]

  const showTitle = type !== 'hero' && type !== 'banner'
  const showSubtitle = ['categories', 'collection', 'products', 'reviews', 'cta'].includes(type)
  const showLimit = ['collection', 'products', 'reviews'].includes(type)

  function patch(changes: Partial<SectionDraft>) {
    setDraft((current) => ({ ...current, ...changes }))
  }

  async function handleSave() {
    if (pending) return
    setPending(true)
    try {
      const payload = {
        type: draft.type,
        title: draft.title,
        subtitle: draft.subtitle,
        image_url: null,
        link_url: draft.link_url,
        link_label: draft.link_label,
        collection_id: draft.collection_id,
        category_id: draft.category_id,
        product_limit: draft.product_limit,
        is_active: draft.is_active,
        config:
          type === 'features'
            ? { items: draft.features }
            : type === 'faq'
              ? { items: draft.faq }
              : type === 'text'
                ? { html: draft.html }
                : {},
      }

      const result = section
        ? await updateSectionAction({ ...payload, id: section.id })
        : await createSectionAction(payload)

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar a seção.')
        return
      }

      toast.success(section ? 'Seção atualizada.' : 'Seção adicionada.')
      onOpenChange(false)
      onSaved()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{section ? `Editar: ${meta.label}` : `Nova seção: ${meta.label}`}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {(type === 'hero' || type === 'banner') && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Esta seção não tem campos próprios: ela mostra os banners cadastrados em{' '}
              <strong className="text-foreground">Banners</strong> com o posicionamento
              correspondente.
            </p>
          )}

          {showTitle && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-title">Título</Label>
              <Input
                id="section-title"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                maxLength={120}
                placeholder={meta.label}
              />
            </div>
          )}

          {showSubtitle && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-subtitle">Subtítulo</Label>
              <Input
                id="section-subtitle"
                value={draft.subtitle}
                onChange={(event) => patch({ subtitle: event.target.value })}
                maxLength={240}
                placeholder="Uma linha curta de apoio"
              />
            </div>
          )}

          {type === 'collection' && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-collection">Coleção</Label>
              <Select
                value={draft.collection_id}
                onValueChange={(value) => patch({ collection_id: value })}
              >
                <SelectTrigger id="section-collection">
                  <SelectValue placeholder="Escolha a coleção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {collections.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === 'products' && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-category">Categoria</Label>
              <Select
                value={draft.category_id}
                onValueChange={(value) => patch({ category_id: value })}
              >
                <SelectTrigger id="section-category">
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {categories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showLimit && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-limit">
                {type === 'reviews' ? 'Quantidade de depoimentos' : 'Quantidade de produtos'}
              </Label>
              <Input
                id="section-limit"
                type="number"
                min={1}
                max={50}
                value={draft.product_limit}
                onChange={(event) => patch({ product_limit: Number(event.target.value) })}
                className="sm:max-w-32"
              />
              <p className="text-xs text-muted-foreground">Entre 1 e 50.</p>
            </div>
          )}

          {type === 'cta' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="section-link">Link do botão</Label>
                <Input
                  id="section-link"
                  value={draft.link_url}
                  onChange={(event) => patch({ link_url: event.target.value })}
                  placeholder="/categoria/robux"
                  maxLength={2048}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="section-link-label">Texto do botão</Label>
                <Input
                  id="section-link-label"
                  value={draft.link_label}
                  onChange={(event) => patch({ link_label: event.target.value })}
                  placeholder="Ver ofertas"
                  maxLength={60}
                />
              </div>
            </div>
          )}

          {type === 'features' && (
            <FeatureItemsEditor
              items={draft.features}
              onChange={(features) => patch({ features })}
            />
          )}

          {type === 'faq' && <FaqItemsEditor items={draft.faq} onChange={(faq) => patch({ faq })} />}

          {type === 'text' && (
            <div className="grid gap-1.5">
              <Label htmlFor="section-html">Conteúdo (HTML)</Label>
              <Textarea
                id="section-html"
                value={draft.html}
                onChange={(event) => patch({ html: event.target.value })}
                rows={10}
                className="font-mono text-xs"
                placeholder="<p>Texto do bloco…</p>"
              />
              <p className="text-xs text-muted-foreground">
                Só formatação é aceita: tags como script, style e iframe são removidas ao salvar.
              </p>
            </div>
          )}

          <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Seção ativa</span>
              <span className="block text-xs text-muted-foreground">
                Desligada, ela some da home sem ser excluída.
              </span>
            </span>
            <Switch
              checked={draft.is_active}
              onCheckedChange={(value) => patch({ is_active: value })}
              aria-label="Seção ativa"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Editores de lista dinâmica (config.items)
// ---------------------------------------------------------------------------

function FeatureItemsEditor({
  items,
  onChange,
}: {
  items: FeatureItem[]
  onChange: (items: FeatureItem[]) => void
}) {
  function update(index: number, changes: Partial<FeatureItem>) {
    onChange(items.map((item, position) => (position === index ? { ...item, ...changes } : item)))
  }

  return (
    <div className="grid gap-2">
      <Label>Itens</Label>

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Nenhum item ainda.
        </p>
      )}

      {items.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover item ${index + 1}`}
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              <X />
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1">
              <Label htmlFor={`feature-icon-${index}`} className="text-xs">
                Ícone
              </Label>
              <Input
                id={`feature-icon-${index}`}
                value={item.icon}
                onChange={(event) => update(index, { icon: event.target.value })}
                list="feature-icon-options"
                maxLength={40}
                placeholder="Zap"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`feature-title-${index}`} className="text-xs">
                Título
              </Label>
              <Input
                id={`feature-title-${index}`}
                value={item.title}
                onChange={(event) => update(index, { title: event.target.value })}
                maxLength={80}
                placeholder="Entrega imediata"
              />
            </div>
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`feature-text-${index}`} className="text-xs">
              Texto
            </Label>
            <Textarea
              id={`feature-text-${index}`}
              value={item.text}
              onChange={(event) => update(index, { text: event.target.value })}
              rows={2}
              maxLength={300}
              placeholder="O código chega no e-mail em segundos."
            />
          </div>
        </div>
      ))}

      <datalist id="feature-icon-options">
        {FEATURE_ICONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= 12}
        onClick={() => onChange([...items, { icon: 'Sparkles', title: '', text: '' }])}
      >
        <Plus />
        Adicionar item
      </Button>
    </div>
  )
}

function FaqItemsEditor({
  items,
  onChange,
}: {
  items: FaqItem[]
  onChange: (items: FaqItem[]) => void
}) {
  function update(index: number, changes: Partial<FaqItem>) {
    onChange(items.map((item, position) => (position === index ? { ...item, ...changes } : item)))
  }

  return (
    <div className="grid gap-2">
      <Label>Perguntas</Label>

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Nenhuma pergunta ainda.
        </p>
      )}

      {items.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pergunta {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover pergunta ${index + 1}`}
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              <X />
            </Button>
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`faq-question-${index}`} className="text-xs">
              Pergunta
            </Label>
            <Input
              id={`faq-question-${index}`}
              value={item.question}
              onChange={(event) => update(index, { question: event.target.value })}
              maxLength={200}
              placeholder="Em quanto tempo recebo o produto?"
            />
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`faq-answer-${index}`} className="text-xs">
              Resposta
            </Label>
            <Textarea
              id={`faq-answer-${index}`}
              value={item.answer}
              onChange={(event) => update(index, { answer: event.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Na hora: o código aparece na tela do pedido assim que o Pix é confirmado."
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= 30}
        onClick={() => onChange([...items, { question: '', answer: '' }])}
      >
        <Plus />
        Adicionar pergunta
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card arrastável
// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: HomepageSection
  summary: string
  canWrite: boolean
  onEdit: () => void
  onToggle: (next: boolean) => void
  onDelete: () => Promise<void>
}

function SectionCard({ section, summary, canWrite, onEdit, onToggle, onDelete }: SectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !canWrite,
  })

  const meta = SECTION_META[section.type]
  const Icon = meta.icon

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-card p-3',
        !section.is_active && 'opacity-60',
        isDragging && 'z-10 border-primary/50 shadow-lg'
      )}
    >
      {canWrite && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${meta.label}`}
          className="mt-1 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{section.title || meta.label}</span>
          <Badge variant="secondary">{meta.label}</Badge>
          {!section.is_active && <Badge variant="muted">Oculta</Badge>}
        </div>

        <p className="text-xs text-muted-foreground">{summary}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={section.is_active}
              disabled={!canWrite}
              onCheckedChange={onToggle}
              aria-label={`${section.is_active ? 'Ocultar' : 'Mostrar'} ${meta.label}`}
            />
            Ativa
          </label>

          <Button variant="outline" size="sm" onClick={onEdit} disabled={!canWrite}>
            <Pencil />
            Editar
          </Button>

          {canWrite && (
            <ConfirmDelete
              onConfirm={onDelete}
              title={`Excluir a seção "${section.title || meta.label}"?`}
              description="A seção sai da home imediatamente. Para escondê-la sem perder o conteúdo, use o botão Ativa."
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

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function HomepageEditor({
  sections,
  collections,
  categories,
  canWrite,
}: HomepageEditorProps) {
  const [items, setItems] = React.useState(sections)

  // Ajuste durante o render em vez de efeito: o router.refresh() depois de
  // salvar tem de aparecer no mesmo commit, sem piscar a lista antiga.
  const [syncedFrom, setSyncedFrom] = React.useState(sections)
  if (sections !== syncedFrom) {
    setSyncedFrom(sections)
    setItems(sections)
  }

  const [editing, setEditing] = React.useState<HomepageSection | null>(null)
  const [creatingType, setCreatingType] = React.useState<SectionType | null>(null)
  const [newType, setNewType] = React.useState<SectionType>('products')
  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  /**
   * Depois de criar/editar, o servidor é a fonte da verdade (ele normaliza o
   * config e zera os campos que não pertencem ao tipo). refresh() traz a linha
   * já normalizada e o efeito acima reidrata a lista.
   */
  function afterSave() {
    router.refresh()
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = items.findIndex((section) => section.id === active.id)
    const to = items.findIndex((section) => section.id === over.id)
    if (from < 0 || to < 0) return

    const previous = items
    const reordered = arrayMove(items, from, to).map((section, index) => ({
      ...section,
      position: index,
    }))
    setItems(reordered)

    const result = await reorderSectionsAction({ ids: reordered.map((section) => section.id) })
    if (!result.ok) {
      setItems(previous)
      toast.error(result.error ?? 'Não foi possível salvar a nova ordem.')
      return
    }
    toast.success('Ordem da home salva.')
  }

  async function handleToggle(section: HomepageSection, next: boolean) {
    const previous = items
    setItems((current) =>
      current.map((row) => (row.id === section.id ? { ...row, is_active: next } : row))
    )

    const result = await toggleSectionActiveAction({ id: section.id, is_active: next })
    if (!result.ok) {
      setItems(previous)
      toast.error(result.error ?? 'Não foi possível alterar a seção.')
      return
    }
    toast.success(next ? 'Seção ativada.' : 'Seção ocultada.')
  }

  async function handleDelete(section: HomepageSection) {
    const result = await deleteSectionAction({ id: section.id })
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir a seção.')

    setItems((current) => current.filter((row) => row.id !== section.id))
    toast.success('Seção excluída.')
  }

  return (
    <div className="grid gap-4">
      {canWrite && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="new-section-type">Adicionar seção</Label>
            <Select value={newType} onValueChange={(value) => setNewType(value as SectionType)}>
              <SelectTrigger id="new-section-type">
                <SelectValue placeholder="Escolha o tipo" />
              </SelectTrigger>
              <SelectContent>
                {SECTION_ORDER.map((type) => (
                  <SelectItem key={type} value={type}>
                    {SECTION_META[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => setCreatingType(newType)} className="sm:w-auto">
            <Plus />
            Adicionar seção
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title="A home ainda não tem seções"
          description="Comece pelo destaque principal e vá empilhando categorias, coleções e depoimentos."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          <SortableContext
            items={items.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="grid gap-2">
              {items.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  summary={summarize(section, collections, categories)}
                  canWrite={canWrite}
                  onEdit={() => setEditing(section)}
                  onToggle={(next) => void handleToggle(section, next)}
                  onDelete={() => handleDelete(section)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canWrite && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Arraste pela alça à esquerda para mudar a ordem da home. A nova ordem de todas as seções é
          salva de uma vez.
        </p>
      )}

      {/* A `key` remonta o diálogo a cada alvo: o rascunho nasce do useState,
          sem efeito de sincronização. */}
      {editing && (
        <SectionDialog
          key={`edit-${editing.id}`}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          section={editing}
          initialType={editing.type}
          collections={collections}
          categories={categories}
          onSaved={afterSave}
        />
      )}

      {creatingType && (
        <SectionDialog
          key={`new-${creatingType}`}
          open
          onOpenChange={(next) => !next && setCreatingType(null)}
          section={null}
          initialType={creatingType}
          collections={collections}
          categories={categories}
          onSaved={afterSave}
        />
      )}
    </div>
  )
}
