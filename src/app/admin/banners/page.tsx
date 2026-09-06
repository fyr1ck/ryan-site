import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Banner } from '@/lib/types/database.types'

import { BannerList } from './banner-list'

export const metadata = { title: 'Banners' }

export default async function AdminBannersPage() {
  const user = await getSessionUser()
  if (!can(user, 'banners.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()
  const { data } = await supabase
    .from('banners')
    .select('*')
    .order('placement', { ascending: true })
    .order('position', { ascending: true })

  const banners = (data ?? []) as Banner[]
  const canWrite = can(user, 'banners.write')

  return (
    <>
      <PageHeader
        title="Banners"
        description="Artes do topo da home, das faixas internas e do topo das categorias."
      >
        {canWrite && (
          <Button asChild>
            <Link href="/admin/banners/novo">
              <Plus />
              Novo banner
            </Link>
          </Button>
        )}
      </PageHeader>

      <BannerList
        banners={banners}
        canWrite={canWrite}
        canDelete={can(user, 'banners.delete')}
        nowIso={new Date().toISOString()}
      />
    </>
  )
}
