'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ChevronRight,
  House,
  Menu,
  Store,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { SOCIAL_META, type SocialKind } from '@/components/store/brand-icons'


/**
 * O lucide removeu os ícones de marca, então cada rede usa o ícone genérico
 * mais próximo do que ela é. O nome acessível vem do aria-label, não do ícone.
 */
export interface MobileMenuLink {
  label: string
  href: string
}

export interface MobileMenuSocial {
  kind: SocialKind
  url: string
}

export interface MobileMenuProps {
  storeName: string
  logoUrl?: string | null
  categories: MobileMenuLink[]
  /** Páginas institucionais publicadas (as mesmas do rodapé). */
  pages: MobileMenuLink[]
  socials: MobileMenuSocial[]
  className?: string
}

/**
 * Menu do celular. Recebe tudo pronto por prop: quem busca no banco é o
 * Header (Server Component) — assim nenhuma credencial ou query entra no
 * bundle do cliente.
 */
export function MobileMenu({
  storeName,
  logoUrl,
  categories,
  pages,
  socials,
  className,
}: MobileMenuProps) {
  const [open, setOpen] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Abrir menu">
          <Menu />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="gap-0 p-0">
        <div className="flex items-center gap-2 border-b border-border p-4 pr-12">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt=""
              width={120}
              height={28}
              unoptimized={logoUrl.endsWith('.svg')}
              className="h-7 w-auto"
            />
          ) : (
            <Store className="size-5 text-primary" aria-hidden />
          )}
          <SheetTitle className="truncate text-base">{storeName}</SheetTitle>
        </div>
        <SheetDescription className="sr-only">
          Navegação principal da loja: categorias, páginas e redes sociais.
        </SheetDescription>

        <nav className="flex flex-col gap-1 p-3">
          <MenuLink href="/" label="Início" icon={<House />} onNavigate={close} />
          <MenuLink href="/produtos" label="Ver produtos" icon={<Store />} onNavigate={close} />
        </nav>

        {categories.length > 0 && (
          <>
            <Separator />
            <div className="p-3">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Categorias
              </p>
              <nav className="flex flex-col gap-0.5">
                {categories.map((category) => (
                  <MenuLink
                    key={category.href}
                    href={category.href}
                    label={category.label}
                    onNavigate={close}
                    trailing={<ChevronRight className="size-4 text-muted-foreground" />}
                  />
                ))}
              </nav>
            </div>
          </>
        )}

        {pages.length > 0 && (
          <>
            <Separator />
            <div className="p-3">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Institucional
              </p>
              <nav className="flex flex-col gap-0.5">
                {pages.map((page) => (
                  <MenuLink
                    key={page.href}
                    href={page.href}
                    label={page.label}
                    onNavigate={close}
                    className="text-sm text-muted-foreground"
                  />
                ))}
              </nav>
            </div>
          </>
        )}

        <div className="mt-auto border-t border-border p-4">
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-4">
              {socials.map(({ kind, url }) => {
                const { label, Icon } = SOCIAL_META[kind]
                return (
                  <a
                    key={kind}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                )
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {storeName}. Todos os direitos reservados.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MenuLink({
  href,
  label,
  icon,
  trailing,
  onNavigate,
  className,
}: {
  href: string
  label: string
  icon?: React.ReactNode
  trailing?: React.ReactNode
  onNavigate: () => void
  className?: string
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  )
}
