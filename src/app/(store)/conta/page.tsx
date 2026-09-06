import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, LogOut, Package, ShieldCheck } from 'lucide-react'

import { signOutAction } from '@/actions/auth'
import { Breadcrumbs } from '@/components/store/breadcrumbs'
import { ProfileForm } from '@/components/store/profile-form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { initials } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Minha conta',
  robots: { index: false, follow: false },
}

/**
 * Painel do cliente.
 *
 * O guard é o requireUser(): deslogado vai para /login?next=/conta e volta
 * para cá depois de entrar. A leitura do telefone usa o client com sessão —
 * a policy `profiles_select_own` já limita a linha ao próprio usuário.
 */
export default async function ContaPage() {
  const user = await requireUser('/conta')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', user.id)
    .maybeSingle<{ phone: string | null }>()

  const displayName = user.fullName ?? user.email

  return (
    <div className="container-store py-6 sm:py-8">
      <Breadcrumbs items={[{ label: 'Minha conta' }]} className="mb-4" />

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Minha conta
            </h1>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut />
            Sair
          </Button>
        </form>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meus dados</CardTitle>
            <CardDescription>
              Usamos estas informações para identificar as suas compras e enviar a entrega.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaultName={user.fullName ?? ''}
              defaultEmail={user.email}
              defaultPhone={profile?.phone ?? ''}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Link
                href="/conta/pedidos"
                className="flex items-center gap-3 p-5 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Package className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">Meus pedidos</span>
                  <span className="block text-sm text-muted-foreground">
                    Acompanhe o status e acesse o conteúdo entregue.
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 p-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">Acesso sem senha</p>
                <p className="text-sm text-muted-foreground">
                  Sua conta entra por link de e-mail ou pelos provedores Google e Discord. Não há
                  senha para vazar.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
