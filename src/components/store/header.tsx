import Image from 'next/image'
import Link from 'next/link'
import { LogIn, LogOut, Receipt, Settings, Store, UserRound } from 'lucide-react'

import { signOutAction } from '@/actions/auth'
import { CartButton } from '@/components/cart/cart-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isAdmin, type SessionUser } from '@/lib/auth'
import { getFeaturedCategories } from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/settings'
import { cn, initials } from '@/lib/utils'

import { getFooterPages, socialLinks } from './footer'
import { MobileMenu } from './mobile-menu'
import { MobileSearch, SearchBar } from './search-bar'

export interface HeaderProps {
  /** Vem do layout, que já chamou getSessionUser(). */
  user?: SessionUser | null
  className?: string
}

/**
 * Cabeçalho da loja.
 *
 * Server Component: busca configurações, categorias e páginas no servidor e
 * entrega prontas para as ilhas de cliente (menu, busca, carrinho). O usuário
 * chega por prop para o layout resolver a sessão uma vez só.
 */
export async function Header({ user = null, className }: HeaderProps) {
  const [settings, categories, pages] = await Promise.all([
    getStoreSettings(),
    getFeaturedCategories(),
    getFooterPages(),
  ])

  const navCategories = categories.slice(0, 5)

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md',
        className
      )}
    >
      <div className="container-store relative flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
        <MobileMenu
          className="-ml-2 lg:hidden"
          storeName={settings.store_name}
          logoUrl={settings.logo_url}
          categories={categories.map((category) => ({
            label: category.name,
            href: `/categoria/${category.slug}`,
          }))}
          pages={pages.map((page) => ({ label: page.title, href: `/pagina/${page.slug}` }))}
          socials={socialLinks(settings)}
        />

        {/* No celular o logo fica centralizado; a partir do md: ele volta para
            o fluxo, à esquerda da navegação. */}
        <Link
          href="/"
          className="absolute left-1/2 flex shrink-0 -translate-x-1/2 items-center gap-2 md:static md:translate-x-0"
          aria-label={`${settings.store_name} — página inicial`}
        >
          {settings.logo_url ? (
            <Image
              src={settings.logo_url}
              alt={settings.store_name}
              width={140}
              height={32}
              priority
              unoptimized={settings.logo_url.endsWith('.svg')}
              style={{ width: 'auto' }}
              className="h-7 w-auto sm:h-8"
            />
          ) : (
            <>
              <Store className="size-5 text-primary" aria-hidden />
              <span className="text-base font-bold sm:text-lg">{settings.store_name}</span>
            </>
          )}
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
          <NavLink href="/produtos">Catálogo</NavLink>
          {navCategories.map((category) => (
            <NavLink key={category.id} href={`/categoria/${category.slug}`}>
              {category.name}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <SearchBar className="hidden w-48 md:block lg:w-64" />
          <MobileSearch className="md:hidden" />
          <CartButton />

          {user ? (
            <AccountMenu user={user} />
          ) : (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/login">
                <LogIn aria-hidden />
                <span className="hidden sm:inline">Entrar</span>
                <span className="sr-only sm:hidden">Entrar</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  )
}

function AccountMenu({ user }: { user: SessionUser }) {
  const name = user.fullName || user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Abrir menu da conta"
        >
          <Avatar className="size-8 sm:size-9">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="normal-case">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/conta">
            <UserRound aria-hidden />
            Minha conta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/conta/pedidos">
            <Receipt aria-hidden />
            Meus pedidos
          </Link>
        </DropdownMenuItem>

        {isAdmin(user) && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Settings aria-hidden />
              Painel administrativo
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Sair muda estado no servidor: precisa ser POST de formulário com
            Server Action, não um link. */}
        <form action={signOutAction}>
          <DropdownMenuItem asChild destructive>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
