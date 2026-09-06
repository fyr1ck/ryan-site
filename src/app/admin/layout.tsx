import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { AdminHeader } from '@/components/admin/admin-header'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Toaster } from '@/components/ui/toaster'
import { requireAdmin } from '@/lib/auth'
import { getStoreSettings } from '@/lib/queries/settings'

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Painel' },
  // Painel nunca vai para buscador, nem que alguém publique o link por engano.
  robots: { index: false, follow: false },
}

/**
 * Shell do painel.
 *
 * O guard fica aqui em cima: qualquer rota criada em /admin nasce protegida
 * sem depender de o autor da página lembrar de checar sessão.
 *
 * A tela de login vive FORA desta pasta (src/app/(admin-publico)/admin/login) porque
 * layout aninhado no App Router soma ao pai em vez de substituí-lo — se ela
 * ficasse em /admin/login, este requireAdmin() rodaria antes dela e o usuário
 * deslogado entraria num laço de redirecionamento para a própria tela de login.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin()
  const settings = await getStoreSettings()

  // Set não é prop: o menu recebe array de strings, simples de serializar.
  const permissions = Array.from(user.permissions) as string[]
  const roleLabel = user.roles.includes('super_admin') ? 'Super admin' : 'Administrador'

  return (
    <div className="min-h-dvh bg-background">
      <AdminSidebar permissions={permissions} storeName={settings.store_name} />

      <div className="lg:pl-60">
        <AdminHeader
          user={{
            name: user.fullName ?? user.email,
            email: user.email,
            avatarUrl: user.avatarUrl,
            roleLabel,
          }}
          permissions={permissions}
          storeName={settings.store_name}
        />

        <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  )
}
