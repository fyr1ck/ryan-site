'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  FolderTree,
  Gamepad2,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Ticket,
  Users,
  FileText,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AppPermission } from '@/lib/types/database.types'

/**
 * Rotas do painel em união literal: se alguém digitar um caminho que não
 * existe, o erro aparece aqui e não numa tela em branco no meio da operação.
 */
export type AdminNavHref =
  | '/admin'
  | '/admin/produtos'
  | '/admin/produtos/novo'
  | '/admin/categorias'
  | '/admin/colecoes'
  | '/admin/pedidos'
  | '/admin/clientes'
  | '/admin/avaliacoes'
  | '/admin/estoque'
  | '/admin/cupons'
  | '/admin/banners'
  | '/admin/homepage'
  | '/admin/paginas'
  | '/admin/configuracoes'
  | '/admin/administracao'
  | '/admin/logs'

export interface AdminNavChild {
  href: AdminNavHref
  label: string
  icon?: LucideIcon
  /** null = visível para qualquer admin. */
  permission: AppPermission | null
}

export interface AdminNavItem extends AdminNavChild {
  icon: LucideIcon
  children?: AdminNavChild[]
}

/**
 * Menu do painel.
 *
 * A permissão aqui é só para NÃO mostrar o que o usuário não pode usar — o que
 * protege de verdade é o RLS no banco e o requirePermission() em cada Server
 * Action. Esconder item de menu é conveniência, nunca segurança.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  {
    href: '/admin/produtos',
    label: 'Produtos',
    icon: Package,
    permission: 'products.read',
    children: [
      { href: '/admin/produtos/novo', label: 'Novo produto', icon: Plus, permission: 'products.write' },
    ],
  },
  { href: '/admin/categorias', label: 'Categorias', icon: FolderTree, permission: 'categories.read' },
  { href: '/admin/colecoes', label: 'Coleções', icon: Layers, permission: 'collections.read' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart, permission: 'orders.read' },
  { href: '/admin/clientes', label: 'Clientes', icon: Users, permission: 'customers.read' },
  { href: '/admin/avaliacoes', label: 'Avaliações', icon: Star, permission: 'reviews.read' },
  { href: '/admin/estoque', label: 'Estoque', icon: Boxes, permission: 'inventory.read' },
  { href: '/admin/cupons', label: 'Cupons', icon: Ticket, permission: 'coupons.read' },
  { href: '/admin/banners', label: 'Banners', icon: ImageIcon, permission: 'banners.read' },
  { href: '/admin/homepage', label: 'Homepage', icon: LayoutTemplate, permission: 'homepage.read' },
  { href: '/admin/paginas', label: 'Páginas', icon: FileText, permission: 'pages.read' },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.read' },
  { href: '/admin/administracao', label: 'Administração', icon: ShieldCheck, permission: 'admins.manage' },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText, permission: 'logs.read' },
]

/** `/admin` só casa exato; o resto casa a seção inteira (`/admin/produtos/123`). */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Título que o header mostra para a rota atual. */
export function adminPageTitle(pathname: string): string {
  for (const item of ADMIN_NAV) {
    for (const child of item.children ?? []) {
      if (pathname === child.href) return child.label
    }
    if (isNavActive(pathname, item.href)) return item.label
  }
  return 'Painel'
}

const linkBase =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export interface AdminNavListProps {
  /** Permissões do usuário, vindas do layout (SessionUser.permissions). */
  permissions: string[]
  /** Fecha o Sheet no mobile depois de navegar. */
  onNavigate?: () => void
  className?: string
}

export function AdminNavList({ permissions, onNavigate, className }: AdminNavListProps) {
  const pathname = usePathname()
  const granted = React.useMemo(() => new Set(permissions), [permissions])

  const allowed = React.useCallback(
    (permission: AppPermission | null) => permission === null || granted.has(permission),
    [granted]
  )

  const items = ADMIN_NAV.filter((item) => allowed(item.permission))

  return (
    <nav aria-label="Seções do painel" className={cn('flex flex-col gap-0.5', className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = isNavActive(pathname, item.href)
        // Subitens só aparecem dentro da seção aberta — menu de 15 linhas já
        // é longo o bastante sem tudo expandido ao mesmo tempo.
        const children = active ? (item.children ?? []).filter((c) => allowed(c.permission)) : []

        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                linkBase,
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>

            {children.length > 0 && (
              <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                {children.map((child) => {
                  const ChildIcon = child.icon
                  const childActive = pathname === child.href
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={childActive ? 'page' : undefined}
                      className={cn(
                        linkBase,
                        'py-1.5 text-[13px]',
                        childActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      {ChildIcon ? (
                        <ChildIcon className="size-3.5 shrink-0" />
                      ) : (
                        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
                      )}
                      <span className="truncate">{child.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function AdminBrand({ storeName, onNavigate }: { storeName: string; onNavigate?: () => void }) {
  return (
    <Link
      href="/admin"
      onClick={onNavigate}
      className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Gamepad2 className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{storeName}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">Painel</span>
      </span>
    </Link>
  )
}

export interface AdminSidebarProps {
  permissions: string[]
  storeName: string
}

/** Barra fixa do desktop. No mobile o mesmo menu vive no Sheet do header. */
export function AdminSidebar({ permissions, storeName }: AdminSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <AdminBrand storeName={storeName} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <AdminNavList permissions={permissions} />
      </div>
    </aside>
  )
}
