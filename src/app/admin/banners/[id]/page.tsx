import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import type { Banner } from '@/lib/types/database.types'

import { BannerForm } from '../banner-form'

export const metadata = { title: 'Editar banner' }

export default async function EditBannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getSessionUser()
  if (!can(user, 'banners.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()
  const { data } = await supabase.from('banners').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()

  const banner = data as Banner

  return (
    <>
      <PageHeader
        title={banner.title}
        description={`Última alteração em ${formatDateTime(banner.updated_at)}.`}
      />
      <BannerForm banner={banner} />
    </>
  )
}
