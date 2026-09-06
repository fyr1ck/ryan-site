import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionUser, isAdmin } from '@/lib/auth'
import { getStoreSettings } from '@/lib/queries/settings'
import { AdminLoginClient } from './login-client'

export const metadata: Metadata = {
  title: 'Entrar no painel',
  robots: { index: false, follow: false },
}

/**
 * Server Component do login do painel.
 *
 * Lê quais provedores OAuth estão habilitados antes de renderizar, e manda
 * quem já é admin direto para o painel — reapresentar a tela de login a quem
 * já tem sessão válida só confunde.
 */
export default async function AdminLoginPage() {
  const user = await getSessionUser()
  if (isAdmin(user)) redirect('/admin')

  const settings = await getStoreSettings()

  return (
    <AdminLoginClient
      oauth={{
        google: settings.auth_google_enabled === true,
        discord: settings.auth_discord_enabled === true,
      }}
    />
  )
}
