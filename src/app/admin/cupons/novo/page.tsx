import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { can, getSessionUser } from '@/lib/auth'

import { PermissionNotice } from '../../permission-notice'
import { CouponForm, EMPTY_COUPON } from '../coupon-form'

export const metadata: Metadata = { title: 'Novo cupom' }

export default async function AdminNewCouponPage() {
  const user = await getSessionUser()

  if (!can(user, 'coupons.write')) {
    return (
      <>
        <PageHeader title="Novo cupom" />
        <PermissionNotice permission="coupons.write" what="a criação de cupons" />
      </>
    )
  }

  return (
    <>
      <Link
        href="/admin/cupons"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Todos os cupons
      </Link>

      <PageHeader
        title="Novo cupom"
        description="O desconto é recalculado no servidor a cada checkout — o que vale é o que está aqui, não o que o carrinho mostra."
      />

      <CouponForm mode="create" initial={EMPTY_COUPON} />
    </>
  )
}
