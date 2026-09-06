'use client'

import * as React from 'react'
import { Loader2, MailCheck, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { signInWithOAuth, signInWithOtp, type OAuthProvider } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/* Marcas dos provedores em traço único, herdando a cor do botão —
   assim o login segue os tokens do tema em vez de cravar hex de marca. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  )
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

export function AdminLoginClient({ oauth }: { oauth: { google: boolean; discord: boolean } }) {
  const [email, setEmail] = React.useState('')
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [loadingProvider, setLoadingProvider] = React.useState<OAuthProvider | null>(null)
  const [pending, startTransition] = React.useTransition()

  const busy = pending || loadingProvider !== null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await signInWithOtp({ email })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível enviar o link de acesso.')
        return
      }
      setSentTo(result.email ?? email)
    })
  }

  function handleOAuth(provider: OAuthProvider) {
    setLoadingProvider(provider)
    startTransition(async () => {
      const result = await signInWithOAuth(provider)
      if (!result.ok || !result.url) {
        toast.error(result.error ?? 'Não foi possível iniciar o login.')
        setLoadingProvider(null)
        return
      }
      // Sai para o provedor: a volta cai em /auth/callback.
      window.location.href = result.url
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <span className="mb-1 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <CardTitle className="text-lg">Painel administrativo</CardTitle>
        <CardDescription>
          Acesso restrito a administradores. Enviamos um link de acesso para o seu e-mail.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sentTo ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-success/25 bg-success/10 p-3">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-success">Link enviado</p>
                <p className="break-words text-sm text-muted-foreground">
                  Abra o e-mail que mandamos para <strong className="text-foreground">{sentTo}</strong>{' '}
                  e clique no link para entrar. Ele expira em poucos minutos.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSentTo(null)}
            >
              Usar outro e-mail
            </Button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email">E-mail</Label>
                <Input
                  id="admin-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  disabled={busy}
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || email.trim() === ''}>
                {pending && loadingProvider === null && <Loader2 className="animate-spin" />}
                Enviar link de acesso
              </Button>
            </form>

            {/* Sem provedor configurado, o separador ficaria pendurado sobre
                um espaço vazio — some junto com os botões. */}
            {(oauth.google || oauth.discord) && (
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">ou continue com</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {oauth.google && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleOAuth('google')}
                >
                  {loadingProvider === 'google' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <GoogleMark />
                  )}
                  Google
                </Button>
              )}
              {oauth.discord && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleOAuth('discord')}
                >
                  {loadingProvider === 'discord' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <DiscordMark />
                  )}
                  Discord
                </Button>
              )}
            </div>
          </>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Entrar aqui não concede privilégios: se a conta não tiver papel de administrador, o
          painel continua bloqueado.
        </p>
      </CardContent>
    </Card>
  )
}
