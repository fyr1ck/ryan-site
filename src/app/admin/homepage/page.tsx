import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { HomepageEditor, type OptionRow } from '@/components/admin/homepage-editor'
import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { HomepageSection } from '@/lib/types/database.types'

export const metadata = { title: 'Homepage' }

export default async function AdminHomepagePage() {
  const user = await getSessionUser()
  if (!can(user, 'homepage.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()

  const [sectionsResult, collectionsResult, categoriesResult] = await Promise.all([
    supabase.from('homepage_sections').select('*').order('position', { ascending: true }),
    supabase.from('collections').select('id, name').order('position', { ascending: true }),
    supabase.from('categories').select('id, name').order('name', { ascending: true }),
  ])

  const sections = (sectionsResult.data ?? []) as HomepageSection[]
  const collections = (collectionsResult.data ?? []) as OptionRow[]
  const categories = (categoriesResult.data ?? []) as OptionRow[]

  return (
    <>
      <PageHeader
        title="Homepage"
        description="A página inicial é esta lista: cada bloco é uma seção, e a ordem aqui é a ordem lá."
      >
        <Button asChild variant="outline">
          <Link href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Ver a home
          </Link>
        </Button>
      </PageHeader>

      <HomepageEditor
        sections={sections}
        collections={collections}
        categories={categories}
        canWrite={can(user, 'homepage.write')}
      />
    </>
  )
}
