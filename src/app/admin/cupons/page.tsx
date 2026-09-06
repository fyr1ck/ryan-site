import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { buttonVariants } from '@/components/ui/button'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { AdminPagination } from '../admin-pagination'
import { PermissionNotice } from '../permission-notice'
import { couponStatus } from './coupon-utils'
import { CouponsTable, type AdminCouponRow } from './coupons-table'

export const metadata: Metadata = { title: 'Cupons' }

const PER_PAGE = 25

interface PageProps {
  searchParams: Promise<{ pagina?: string }>
}

interface CouponRow {
  id: string
  code: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  usage_count: number
  usage_limit: number | null
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
}

function parsePage(value: string | undefined): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  const { pagina } = await searchParams

  const user = await getSessionUser()
  if (!can(user, 'coupons.read')) {
    return (
      <>
        <PageHeader title="Cupons" />
        <PermissionNotice permission="coupons.read" what="os cupons" />
      </>
    )
  }

  const page = parsePage(pagina)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()

  const { data, count, error } = await supabase
    .from('coupons')
    .select(
      'id, code, description, type, value, usage_count, usage_limit, starts_at, expires_at, is_active',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (error) console.error('[AdminCouponsPage]', error)

  const rows: AdminCouponRow[] = ((data ?? []) as unknown as CouponRow[]).map((coupon) => {
    const status = couponStatus(coupon)
    return {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      // numeric do Postgres chega como string quando passa da precisão do JS.
      value: Number(coupon.value),
      usage_count: coupon.usage_count,
      usage_limit: coupon.usage_limit,
      starts_at: coupon.starts_at,
      expires_at: coupon.expires_at,
      status_label: status.label,
      status_variant: status.variant,
    }
  })

  const total = count ?? rows.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <PageHeader
        title="Cupons"
        description="O cliente nunca lista cupons: o código é validado no servidor, no momento do checkout."
      >
        {can(user, 'coupons.write') && (
          <Link href="/admin/cupons/novo" className={cn(buttonVariants())}>
            <Plus />
            Novo cupom
          </Link>
        )}
      </PageHeader>

      <CouponsTable rows={rows} />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/cupons"
        itemLabel="cupons"
      />
    </>
  )
}
