import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { getStoreSettings } from '@/lib/queries/settings'
import { sanitizeHtml, stripHtml } from '@/lib/sanitize'
import { buildMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import type { Page as CmsPage } from '@/lib/types/database.types'

/**
 * Página institucional do CMS (termos, privacidade, sobre, FAQ).
 *
 * A consulta mora aqui, e não em @/lib/queries, porque só esta rota precisa
 * dela. `cache()` deduplica a chamada entre generateMetadata() e o render —
 * são duas execuções do mesmo request, e sem isso o banco seria consultado
 * duas vezes por acesso.
 *
 * O filtro `is_published` é redundante com o RLS de propósito: se um dia a
 * política mudar, a página despublicada continua fora do ar por aqui.
 */
const getPage = cache(async (slug: string): Promise<CmsPage | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  return (data as CmsPage) ?? null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    return buildMetadata({
      title: 'Página não encontrada',
      description: 'Esta página saiu do ar ou o link está errado.',
      path: `/pagina/${slug}`,
      noIndex: true,
    })
  }

  const settings = await getStoreSettings()

  return buildMetadata({
    title: page.seo_title || page.title,
    description:
      page.seo_description ||
      stripHtml(page.excerpt || page.content, 200) ||
      `${page.title} — ${settings.store_name}.`,
    image: settings.seo_og_image,
    path: `/pagina/${page.slug}`,
    type: 'article',
  })
}

export default async function PaginaInstitucional({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) notFound()

  const content = sanitizeHtml(page.content)

  return (
    <div className="container-store py-4 lg:py-8">
      {/* Largura de leitura: linha longa demais cansa antes do fim do texto. */}
      <article className="mx-auto flex max-w-3xl flex-col gap-4">
        <Breadcrumbs items={[{ label: page.title }]} />

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{page.title}</h1>
          {page.excerpt && (
            <p className="text-sm leading-relaxed text-muted-foreground">{page.excerpt}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Atualizada em {formatDate(page.updated_at)}
          </p>
        </header>

        {content ? (
          // O HTML vem do painel e já passou por sanitizeHtml().
          <div className="prose-store" dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta página ainda não tem conteúdo publicado.
          </p>
        )}
      </article>
    </div>
  )
}
