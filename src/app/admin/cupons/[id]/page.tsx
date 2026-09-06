import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { centsToInput, formatDateTime } from '@/lib/utils'

import { PermissionNotice } from '../../permission-notice'
import { CouponForm, type CouponFormValues } from '../coupon-form'
import { couponStatus, toDateTimeLocal } from '../coupon-utils'

interface PageProps {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CouponRow {
  id: string
  code: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number | string
  minimum_order_cents: number
  maximum_discount_cents: number | null
  usage_limit: number | null
  usage_count: number
  per_customer_limit: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return { title: 'Cupom' }

  const supabase = await createClient()
  const { data } = await supabase.from('coupons').select('code').eq('id', id).maybeSingle()

  return { title: data ? `Cupom ${data.code}` : 'Cupom' }
}

export default async function AdminCouponDetailPage({ params }: PageProps) {
  const { id } = await params

  const user = await getSessionUser()
  if (!can(user, 'coupons.read')) {
    return (
      <>
        <PageHeader title="Cupom" />
        <PermissionNotice permission="coupons.read" what="este cupom" />
      </>
    )
  }

  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()
  const { data } = await supabase
    .from('coupons')
    .select(
      'id, code, description, type, value, minimum_order_cents, maximum_discount_cents, usage_limit, usage_count, per_customer_limit, starts_at, expires_at, is_active, created_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const coupon = data as unknown as CouponRow

  const numericValue = Number(coupon.value)
  const status = couponStatus(coupon)

  const initial: CouponFormValues = {
    code: coupon.code,
    description: coupon.description ?? '',
    type: coupon.type,
    // Percentual sai como número; valor fixo volta para "69,90", que é o
    // formato que o campo de dinheiro do painel usa em toda a loja.
    value:
      coupon.type === 'percentage'
        ? String(numericValue)
        : centsToInput(Math.round(numericValue * 100)),
    minimum_order:
      coupon.minimum_order_cents > 0 ? centsToInput(coupon.minimum_order_cents) : '',
    maximum_discount:
      coupon.maximum_discount_cents !== null ? centsToInput(coupon.maximum_discount_cents) : '',
    usage_limit: coupon.usage_limit !== null ? String(coupon.usage_limit) : '',
    per_customer_limit: String(coupon.per_customer_limit),
    starts_at: toDateTimeLocal(coupon.starts_at),
    expires_at: toDateTimeLocal(coupon.expires_at),
    is_active: coupon.is_active,
  }

  const readOnly = !can(user, 'coupons.write')

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
        title={coupon.code}
        description={`Criado em ${formatDateTime(coupon.created_at)} · ${coupon.usage_count} uso(s)`}
      >
        <Badge variant={status.variant}>{status.label}</Badge>
      </PageHeader>

      {readOnly ? (
        <PermissionNotice permission="coupons.write" what="a edição deste cupom" />
      ) : (
        <CouponForm
          mode="edit"
          couponId={coupon.id}
          initial={initial}
          usageCount={coupon.usage_count}
          canDelete={can(user, 'coupons.delete')}
        />
      )}
    </>
  )
}
