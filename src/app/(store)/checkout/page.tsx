import type { Metadata } from 'next'
import { Lock } from 'lucide-react'

import { CheckoutForm } from '@/components/store/checkout-form'
import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { getSessionUser } from '@/lib/auth'
import { getStoreSettings } from '@/lib/queries/settings'
import { buildMetadata } from '@/lib/seo'

/**
 * Checkout.
 *
 * O Server Component só monta o contexto (sessão + configurações da loja) e
 * entrega para o formulário client, que é quem enxerga o carrinho do
 * localStorage. Nada de dinheiro é decidido nesta camada.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Checkout',
  description: 'Finalize a sua compra com pagamento via Pix e entrega digital imediata.',
  path: '/checkout',
  // Página de compra não vai para buscador.
  noIndex: true,
})

export default async function CheckoutPage() {
  const [user, settings] = await Promise.all([getSessionUser(), getStoreSettings()])

  return (
    <div className="container-store py-6 sm:py-8">
      <Breadcrumbs items={[{ label: 'Checkout' }]} className="mb-4" />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Checkout</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5 text-success" aria-hidden />
          Ambiente seguro. Seus dados são usados apenas para a entrega do pedido.
        </p>
      </header>

      <CheckoutForm
        isLoggedIn={user !== null}
        defaultEmail={user?.email ?? null}
        defaultName={user?.fullName ?? null}
        termsUrl={settings.checkout_terms_url || '/pagina/termos'}
        pixEnabled={settings.payment_pix_enabled}
      />
    </div>
  )
}
