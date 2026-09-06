import { ShieldAlert } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'

import { CollectionForm, EMPTY_COLLECTION } from '../collection-form'

export const metadata = { title: 'Nova coleção' }

export default async function NewCollectionPage() {
  const user = await getSessionUser()

  if (!can(user, 'collections.write')) {
    return (
      <>
        <PageHeader title="Nova coleção" />
        <EmptyState
          icon={<ShieldAlert />}
          title="Você não pode criar coleções"
          description="Peça a um super admin a permissão collections.write."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Nova coleção"
        description="Salve primeiro; os produtos são escolhidos na tela de edição."
      />

      <CollectionForm mode="create" initial={EMPTY_COLLECTION} />
    </>
  )
}
