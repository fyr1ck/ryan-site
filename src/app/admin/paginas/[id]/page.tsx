import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import type { Page } from '@/lib/types/database.types'

import { PageForm } from '../page-form'

export const metadata = { title: 'Editar página' }

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getSessionUser()
  if (!can(user, 'pages.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()
  const { data } = await supabase.from('pages').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()

  const page = data as Page

  return (
    <>
      <PageHeader
        title={page.title}
        description={`Última alteração em ${formatDateTime(page.updated_at)}.`}
      >
        <Badge variant={page.is_published ? 'success' : 'muted'}>
          {page.is_published ? 'Publicada' : 'Rascunho'}
        </Badge>
      </PageHeader>

      <PageForm page={page} />
    </>
  )
}
