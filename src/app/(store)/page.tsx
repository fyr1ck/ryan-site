import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LayoutTemplate } from 'lucide-react'

import { HomeSections } from '@/components/store/home-sections'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getStoreSettings } from '@/lib/queries/settings'
import { buildMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import type { HomepageSection } from '@/lib/types/database.types'

/**
 * Seções publicadas da home, na ordem do painel.
 *
 * O `is_active` é explícito de propósito: a policy de admin permite ler tudo,
 * então um administrador logado veria na loja seções que ele deixou
 * desativadas. A vitrine tem que ser a mesma para todo mundo.
 */
const getHomepageSections = cache(async (): Promise<HomepageSection[]> => {
  const supabase = await createClient()

  const { data } = await supabase
    .from('homepage_sections')
    .select('*')
    .eq('is_active', true)
    .order('position')

  return (data as HomepageSection[]) ?? []
})

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()

  const title =
    settings.seo_title ||
    (settings.store_tagline
      ? `${settings.store_name} — ${settings.store_tagline}`
      : settings.store_name)

  const base = buildMetadata({
    title,
    description:
      settings.seo_description || settings.store_description || settings.store_tagline,
    image: settings.seo_og_image,
    path: '/',
    siteName: settings.store_name,
  })

  // `absolute` desliga o template do layout raiz — sem ele o nome da loja
  // apareceria duas vezes no título da própria home.
  return { ...base, title: { absolute: title } }
}

export default async function HomePage() {
  const [sections, settings] = await Promise.all([getHomepageSections(), getStoreSettings()])

  if (sections.length === 0) {
    return (
      <div className="container-store py-16">
        <EmptyState
          icon={<LayoutTemplate />}
          title="A vitrine ainda está sendo montada"
          description="As seções da página inicial são publicadas pelo painel. Enquanto isso, o catálogo já está disponível."
          action={
            <Button asChild>
              <Link href="/produtos">Ver o catálogo</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return <HomeSections sections={sections} settings={settings} />
}
