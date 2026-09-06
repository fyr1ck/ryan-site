import { cache } from 'react'
import type { ReactNode } from 'react'

import { CartDrawer } from '@/components/cart/cart-drawer'
import { Footer } from '@/components/store/footer'
import { Header } from '@/components/store/header'
import {
  SocialProofPopup,
  type SocialProofPurchase,
} from '@/components/store/social-proof-popup'
import { getSessionUser } from '@/lib/auth'
import { getStoreSettings } from '@/lib/queries/settings'
import { organizationJsonLd } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'

/** Linha crua do PostgREST: o join many-to-one pode vir objeto ou array. */
interface RecentPurchaseRow {
  id: string
  customer_name: string
  created_at: string
  products:
    | { name: string; slug: string; product_images: { url: string; position: number }[] | null }
    | { name: string; slug: string; product_images: { url: string; position: number }[] | null }[]
    | null
}

/**
 * Compras recentes para o popup de prova social.
 *
 * A fonte são as avaliações aprovadas de compra verificada, e não a tabela
 * `orders`: pedido é dado privado (o RLS só devolve o do próprio cliente), e
 * expor compra alheia na home seria vazamento. A avaliação já é pública por
 * política e carrega nome, produto e data — exatamente o que o aviso mostra.
 */
const getSocialProofPurchases = cache(async (): Promise<SocialProofPurchase[]> => {
  const supabase = await createClient()

  const { data } = await supabase
    .from('reviews')
    .select('id, customer_name, created_at, products (name, slug, product_images (url, position))')
    .eq('is_approved', true)
    .eq('is_verified_purchase', true)
    .order('created_at', { ascending: false })
    .limit(8)

  const rows = (data as unknown as RecentPurchaseRow[]) ?? []

  return rows.flatMap((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    if (!product) return []

    const cover = [...(product.product_images ?? [])].sort((a, b) => a.position - b.position)[0]

    return [
      {
        id: row.id,
        customerName: row.customer_name,
        productName: product.name,
        productSlug: product.slug,
        productImageUrl: cover?.url ?? null,
        createdAt: row.created_at,
      },
    ]
  })
})

/** `</script>` dentro de string do banco encerraria a tag e viraria XSS. */
function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/**
 * Shell da vitrine.
 *
 * A sessão é resolvida uma única vez aqui e desce por prop para o Header —
 * assim nenhuma página precisa lembrar de buscar usuário para o cabeçalho.
 * O carrinho e o popup ficam fora do <main> porque são camadas flutuantes,
 * não conteúdo da página.
 */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [user, settings] = await Promise.all([getSessionUser(), getStoreSettings()])
  const purchases = settings.show_social_proof ? await getSocialProofPurchases() : []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd(settings)) }}
      />

      <Header user={user} />

      <main className="flex-1">{children}</main>

      <Footer />

      <CartDrawer />

      {settings.show_social_proof && purchases.length > 0 && (
        <SocialProofPopup purchases={purchases} enabled />
      )}
    </>
  )
}
