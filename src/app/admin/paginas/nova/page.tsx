import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'

import { PageForm } from '../page-form'

export const metadata = { title: 'Nova página' }

export default async function NewPagePage() {
  const user = await getSessionUser()
  if (!can(user, 'pages.write')) redirect('/admin/paginas?erro=sem-permissao')

  return (
    <>
      <PageHeader
        title="Nova página"
        description="Ela nasce em rascunho: só vai ao ar quando você marcar como publicada."
      />
      <PageForm />
    </>
  )
}
