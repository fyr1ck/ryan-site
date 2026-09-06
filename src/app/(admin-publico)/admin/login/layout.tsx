import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Toaster } from '@/components/ui/toaster'
import { getStoreSettings } from '@/lib/queries/settings'

export const metadata: Metadata = {
  title: 'Entrar no painel',
  robots: { index: false, follow: false },
}

/**
 * Layout da tela de login do painel.
 *
 * Esta rota fica num route group fora de src/app/admin de propósito: layout
 * aninhado SOMA ao layout do pai, nunca o substitui. Se a pasta fosse
 * src/app/admin/login, o requireAdmin() do layout do painel rodaria antes desta
 * página e mandaria o visitante deslogado para /admin/login de novo, em laço.
 * O grupo (admin-publico) some da URL — o endereço continua sendo /admin/login.
 *
 * Nenhum guard aqui: é a única rota do painel que precisa abrir sem sessão.
 */
export default async function AdminLoginLayout({ children }: { children: ReactNode }) {
  const settings = await getStoreSettings()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      {/* Ou o logo, ou o nome — nunca os dois. O logo da loja normalmente já
          traz o nome desenhado, e mostrar o texto ao lado o repetia. Quando
          o admin sobe uma marca só de símbolo, o alt garante a leitura. */}
      <Link href="/" className="flex items-center gap-2.5">
        {settings.logo_url ? (
          <Image
            src={settings.logo_url}
            alt={settings.store_name}
            width={140}
            height={32}
            unoptimized={settings.logo_url.endsWith('.svg')}
            // Marca horizontal (140x32): a altura manda e a largura acompanha.
            style={{ width: 'auto' }}
            className="h-9 w-auto"
          />
        ) : (
          <span className="text-lg font-semibold tracking-tight">{settings.store_name}</span>
        )}
      </Link>

      {children}

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para a loja
      </Link>

      <Toaster />
    </div>
  )
}
