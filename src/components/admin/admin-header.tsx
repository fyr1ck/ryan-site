'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, ExternalLink, Loader2, LogOut, Menu, Store } from 'lucide-react'

import { signOutAction } from '@/actions/auth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn, initials } from '@/lib/utils'
import { AdminNavList, adminPageTitle } from '@/components/admin/admin-sidebar'

export interface AdminHeaderUser {
  name: string
  email: string
  avatarUrl: string | null
  /** "Super admin" / "Administrador" — já traduzido no layout. */
  roleLabel: string
}

export interface AdminHeaderProps {
  user: AdminHeaderUser
  permissions: string[]
  storeName: string
}

export function AdminHeader({ user, permissions, storeName }: AdminHeaderProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [signingOut, startSignOut] = React.useTransition()

  const title = adminPageTitle(pathname)

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border',
        'bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-5'
      )}
    >
      {/* Menu do mobile: mesmo componente de navegação do desktop, dentro do Sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menu">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[17rem] gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-base">{storeName}</SheetTitle>
            <SheetDescription>Painel administrativo</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <AdminNavList permissions={permissions} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <p className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">{title}</p>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          {/* Loja em outra aba: quem está editando não perde o formulário aberto. */}
          <a href="/" target="_blank" rel="noopener noreferrer">
            Ver loja
            <ExternalLink />
          </a>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Abrir menu do usuário"
            >
              <Avatar className="size-8">
                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback>{initials(user.name || user.email)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-40 text-left md:block">
                <span className="block truncate text-xs font-semibold leading-tight">{user.name}</span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {user.roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <Badge variant="muted" className="mt-2">
                {user.roleLabel}
              </Badge>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild className="sm:hidden">
              <a href="/" target="_blank" rel="noopener noreferrer">
                <Store />
                Ver loja
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem
              destructive
              disabled={signingOut}
              onSelect={(event) => {
                // Sem o preventDefault o menu fecha e desmonta a transição.
                event.preventDefault()
                startSignOut(async () => {
                  await signOutAction()
                })
              }}
            >
              {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
              {signingOut ? 'Saindo…' : 'Sair'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
