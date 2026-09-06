import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'

import { BannerForm } from '../banner-form'

export const metadata = { title: 'Novo banner' }

export default async function NewBannerPage() {
  const user = await getSessionUser()
  if (!can(user, 'banners.write')) redirect('/admin/banners?erro=sem-permissao')

  return (
    <>
      <PageHeader
        title="Novo banner"
        description="A arte entra no fim da fila do posicionamento escolhido; a ordem se ajusta na listagem."
      />
      <BannerForm />
    </>
  )
}
