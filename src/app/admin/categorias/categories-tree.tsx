'use client'

import * as React from 'react'
import Link from 'next/link'
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
import { CornerDownRight, FolderTree, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { deleteCategory, reorderCategories } from '@/actions/categories'
import { cn } from '@/lib/utils'

export interface CategoryNode {
  id: string
  name: string
  slug: string
  image_url: string | null
  is_active: boolean
  is_featured: boolean
  show_on_home: boolean
  product_count: number
  children: CategoryNode[]
}

export interface CategoriesTreeProps {
  nodes: CategoryNode[]
  canWrite: boolean
  canDelete: boolean
}

// -----------------------------------------------------------------------------
// Navegação na árvore
// -----------------------------------------------------------------------------

interface Group {
  /** null = lista de raízes. */
  parentId: string | null
  items: CategoryNode[]
}

/** Em qual lista de irmãos este id está. Percorre a árvore inteira. */
function findGroup(nodes: CategoryNode[], id: string, parentId: string | null = null): Group | null {
  if (nodes.some((node) => node.id === id)) return { parentId, items: nodes }
  for (const node of nodes) {
    const found = findGroup(node.children, id, node.id)
    if (found) return found
  }
  return null
}

/** Devolve a árvore com um grupo de irmãos substituído pela nova ordem. */
function replaceGroup(
  nodes: CategoryNode[],
  parentId: string | null,
  reordered: CategoryNode[]
): CategoryNode[] {
  if (parentId === null) return reordered
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: reordered }
      : { ...node, children: replaceGroup(node.children, parentId, reordered) }
  )
}

// -----------------------------------------------------------------------------
// Linha
// -----------------------------------------------------------------------------

interface RowProps {
  node: CategoryNode
  depth: number
  canWrite: boolean
  canDelete: boolean
  onDelete: (node: CategoryNode) => Promise<void>
}

function CategoryRow({ node, depth, canWrite, canDelete, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: !canWrite,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-card p-2 sm:gap-3 sm:p-2.5',
        isDragging && 'z-10 border-primary opacity-90 shadow-lg'
      )}
    >
      {canWrite ? (
        <button
          type="button"
          aria-label={`Reordenar ${node.name}`}
          className="grid size-8 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="size-8 shrink-0" />
      )}

      {depth > 0 && <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />}

      <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
        {node.image_url ? (
          <NextImage
            src={node.image_url}
            alt=""
            fill
            sizes="36px"
            unoptimized={node.image_url.endsWith('.svg')}
            className="object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <FolderTree className="size-4" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <Link
          href={`/admin/categorias/${node.id}`}
          className="block truncate text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {node.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          /{node.slug} · {node.product_count.toLocaleString('pt-BR')} produto(s)
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {!node.is_active && <Badge variant="muted">Inativa</Badge>}
        {node.is_featured && <Badge variant="default">Popular</Badge>}
        {node.show_on_home && <Badge variant="secondary">Home</Badge>}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="icon-sm" title="Editar">
          <Link href={`/admin/categorias/${node.id}`} aria-label={`Editar ${node.name}`}>
            <Pencil />
          </Link>
        </Button>

        {canDelete && (
          <ConfirmDelete
            onConfirm={() => onDelete(node)}
            title={`Excluir "${node.name}"?`}
            description={
              node.children.length > 0
                ? 'As subcategorias viram categorias raiz e os produtos ficam sem categoria principal. Nada é apagado junto, mas a organização se desfaz.'
                : 'Os produtos desta categoria ficam sem categoria principal. Nenhum produto é apagado.'
            }
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                title="Excluir"
                aria-label={`Excluir ${node.name}`}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
              </Button>
            }
          />
        )}
      </span>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Grupo de irmãos (recursivo)
// -----------------------------------------------------------------------------

interface GroupProps extends Omit<RowProps, 'node' | 'depth'> {
  items: CategoryNode[]
  depth: number
}

function CategoryGroup({ items, depth, ...rowProps }: GroupProps) {
  return (
    <SortableContext items={items.map((node) => node.id)} strategy={verticalListSortingStrategy}>
      <ul className={cn('space-y-2', depth > 0 && 'ml-5 mt-2 sm:ml-8')}>
        {items.map((node) => (
          <React.Fragment key={node.id}>
            <CategoryRow node={node} depth={depth} {...rowProps} />
            {node.children.length > 0 && (
              <li>
                <CategoryGroup items={node.children} depth={depth + 1} {...rowProps} />
              </li>
            )}
          </React.Fragment>
        ))}
      </ul>
    </SortableContext>
  )
}

// -----------------------------------------------------------------------------
// Árvore
// -----------------------------------------------------------------------------

/**
 * Árvore de categorias com reordenação por arrasto.
 *
 * O arrasto só reordena IRMÃOS: mudar de pai altera o parent_id e pode criar
 * ciclo, então isso é decisão de formulário (com validação), não de gesto. Um
 * arrasto entre grupos diferentes é recusado com aviso, e não reparenta.
 */
export function CategoriesTree({ nodes, canWrite, canDelete }: CategoriesTreeProps) {
  const router = useRouter()
  const [tree, setTree] = React.useState<CategoryNode[]>(nodes)
  const [syncedNodes, setSyncedNodes] = React.useState<CategoryNode[]>(nodes)

  // O servidor é a verdade: quando o router.refresh() traz uma árvore nova, a
  // cópia local volta a ela. O ajuste é feito durante o render (e não num
  // efeito) para não exibir a ordem antiga por um quadro.
  if (nodes !== syncedNodes) {
    setSyncedNodes(nodes)
    setTree(nodes)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function persist(items: CategoryNode[]) {
    const result = await reorderCategories({
      items: items.map((node, index) => ({ id: node.id, position: index })),
    })

    if (!result.ok) {
      toast.error(result.error ?? 'Não foi possível salvar a ordem.')
      setTree(nodes)
      return
    }

    toast.success('Ordem salva.')
    router.refresh()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const source = findGroup(tree, String(active.id))
    const target = findGroup(tree, String(over.id))
    if (!source || !target) return

    if (source.parentId !== target.parentId) {
      toast.info('Arraste só entre categorias do mesmo nível. Para trocar de pai, edite a categoria.')
      return
    }

    const from = source.items.findIndex((node) => node.id === active.id)
    const to = source.items.findIndex((node) => node.id === over.id)
    if (from < 0 || to < 0) return

    const reordered = arrayMove(source.items, from, to)
    setTree((current) => replaceGroup(current, source.parentId, reordered))
    void persist(reordered)
  }

  async function handleDelete(node: CategoryNode) {
    const result = await deleteCategory({ id: node.id })
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível excluir a categoria.')
    toast.success('Categoria excluída.')
    router.refresh()
  }

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={<FolderTree />}
        title="Nenhuma categoria ainda"
        description="As categorias organizam a vitrine e o menu da loja."
        action={
          canWrite ? (
            <Button asChild size="sm">
              <Link href="/admin/categorias/nova">Criar primeira categoria</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <CategoryGroup
        items={tree}
        depth={0}
        canWrite={canWrite}
        canDelete={canDelete}
        onDelete={handleDelete}
      />
    </DndContext>
  )
}
