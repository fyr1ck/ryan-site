import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/auth'
import { getStoreSettings } from '@/lib/queries/settings'
import { buildMetadata } from '@/lib/seo'
import { LoginPageClient } from './login-client'

/**
 * Server Component do login.
 *
 * Existe para ler as configurações antes de renderizar: quais provedores OAuth
 * estão realmente habilitados. Mostrar "Entrar com Google" quando o provedor
 * não foi configurado no Supabase leva o cliente a um 400 — botão que não
 * funciona é pior do que botão que não existe.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  return buildMetadata({
    title: 'Entrar',
    description: `Acesse sua conta na ${settings.store_name} para acompanhar seus pedidos.`,
    path: '/login',
    noIndex: true,
  })
}

export default async function LoginPage() {
  // Quem já está logado não tem o que fazer aqui.
  const user = await getSessionUser()
  if (user) redirect('/conta')

  const settings = await getStoreSettings()

  return (
    <LoginPageClient
      oauth={{
        google: settings.auth_google_enabled === true,
        discord: settings.auth_discord_enabled === true,
      }}
    />
  )
}
