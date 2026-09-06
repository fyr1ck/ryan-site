import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Page } from '@/lib/types/database.types'

import { PagesTable } from './pages-table'

export const metadata = { title: 'Páginas' }

export default async function AdminPagesPage() {
  const user = await getSessionUser()
  if (!can(user, 'pages.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()
  const { data } = await supabase
    .from('pages')
    .select('*')
    .order('position', { ascending: true })
    .order('title', { ascending: true })

  const pages = (data ?? []) as Page[]
  const canWrite = can(user, 'pages.write')

  return (
    <>
      <PageHeader
        title="Páginas"
        description="Termos, política de privacidade, sobre a loja — conteúdo fixo com endereço próprio."
      >
        {canWrite && (
          <Button asChild>
            <Link href="/admin/paginas/nova">
              <Plus />
              Nova página
            </Link>
          </Button>
        )}
      </PageHeader>

      <PagesTable pages={pages} canWrite={canWrite} canDelete={can(user, 'pages.delete')} />
    </>
  )
}
