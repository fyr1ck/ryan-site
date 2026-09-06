import { cache } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail,
  ShieldCheck,
  Store,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { getFeaturedCategories } from '@/lib/queries/catalog'
import { getStoreSettings, type StoreSettings } from '@/lib/queries/settings'
import { cn } from '@/lib/utils'
import type { Page } from '@/lib/types/database.types'

import { SOCIAL_META, type SocialKind } from '@/components/store/brand-icons'

export type FooterPage = Pick<Page, 'id' | 'title' | 'slug'>

/**
 * Páginas institucionais do rodapé.
 *
 * Mora aqui, e não em @/lib/queries, porque só o rodapé e o menu mobile
 * precisam dela. `cache()` deduplica a consulta quando o Header e o Footer
 * pedem a mesma lista no mesmo render.
 */
export const getFooterPages = cache(async (): Promise<FooterPage[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pages')
    .select('id, title, slug')
    .eq('is_published', true)
    .eq('show_in_footer', true)
    .order('position')

  return (data as FooterPage[]) ?? []
})

/** Redes com URL preenchida no painel, na ordem em que devem aparecer. */
export function socialLinks(settings: StoreSettings): { kind: SocialKind; url: string }[] {
  return (
    [
      { kind: 'whatsapp' as const, url: settings.whatsapp_url },
      { kind: 'instagram' as const, url: settings.instagram_url },
      { kind: 'discord' as const, url: settings.discord_url },
      { kind: 'youtube' as const, url: settings.youtube_url },
      { kind: 'tiktok' as const, url: settings.tiktok_url },
    ] satisfies { kind: SocialKind; url: string }[]
  ).filter((social) => social.url.trim().length > 0)
}

export async function Footer({ className }: { className?: string }) {
  const [settings, pages, categories] = await Promise.all([
    getStoreSettings(),
    getFooterPages(),
    getFeaturedCategories(),
  ])

  const socials = socialLinks(settings)
  const year = new Date().getFullYear()

  return (
    <footer className={cn('mt-12 border-t border-border bg-card/40', className)}>
      <div className="container-store grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <Link href="/" className="flex items-center gap-2">
            {settings.logo_url ? (
              <Image
                src={settings.logo_url}
                alt={settings.store_name}
                width={140}
                height={32}
                unoptimized={settings.logo_url.endsWith('.svg')}
                style={{ width: 'auto' }}
                className="h-8 w-auto"
              />
            ) : (
              <>
                <Store className="size-5 text-primary" aria-hidden />
                <span className="text-lg font-bold">{settings.store_name}</span>
              </>
            )}
          </Link>

          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {settings.store_description || settings.store_tagline}
          </p>

          {settings.contact_email && (
            <a
              href={`mailto:${settings.contact_email}`}
              className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="size-4" aria-hidden />
              {settings.contact_email}
            </a>
          )}
        </div>

        <FooterColumn title="Loja">
          <FooterLink href="/produtos">Todos os produtos</FooterLink>
          {categories.slice(0, 5).map((category) => (
            <FooterLink key={category.id} href={`/categoria/${category.slug}`}>
              {category.name}
            </FooterLink>
          ))}
        </FooterColumn>

        {pages.length > 0 && (
          <FooterColumn title="Institucional">
            {pages.map((page) => (
              <FooterLink key={page.id} href={`/pagina/${page.slug}`}>
                {page.title}
              </FooterLink>
            ))}
          </FooterColumn>
        )}

        <div className="flex flex-col gap-3">
          {socials.length > 0 && (
            <>
              <p className="text-sm font-semibold">Fale com a gente</p>
              <div className="flex flex-wrap gap-2">
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
            </>
          )}

          {settings.payment_pix_enabled && (
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Pagamento via Pix com entrega automática
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border py-4">
        <p className="container-store text-center text-xs text-muted-foreground">
          © {year} {settings.store_name}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      <nav className="flex flex-col gap-1.5">{children}</nav>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  )
}
