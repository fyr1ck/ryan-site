'use client'

import * as React from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { updateProfileAction } from '@/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ProfileFormProps {
  defaultName: string
  defaultEmail: string
  defaultPhone: string
}

/**
 * Formulário de dados do cliente.
 *
 * Não valida regra de negócio aqui: a checagem que vale é a do zod dentro da
 * Server Action, que roda depois do requireUser(). O que existe nesta camada é
 * conveniência (campos obrigatórios do HTML) e o retorno para a tela.
 */
export function ProfileForm({ defaultName, defaultEmail, defaultPhone }: ProfileFormProps) {
  const [fullName, setFullName] = React.useState(defaultName)
  const [email, setEmail] = React.useState(defaultEmail)
  const [phone, setPhone] = React.useState(defaultPhone)

  const [feedback, setFeedback] = React.useState<{ type: 'ok' | 'erro'; text: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  const dirty =
    fullName !== defaultName || email !== defaultEmail || phone !== defaultPhone

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const result = await updateProfileAction({ full_name: fullName, email, phone })

      if (!result.ok) {
        const text = result.error ?? 'Não foi possível salvar os seus dados.'
        setFeedback({ type: 'erro', text })
        toast.error(text)
        return
      }

      const text = result.message ?? 'Dados salvos.'
      setFeedback({ type: 'ok', text })
      toast.success(result.emailPending ? 'Confirme o novo e-mail.' : 'Dados salvos.')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="perfil-nome">Nome completo</Label>
        <Input
          id="perfil-nome"
          name="full_name"
          autoComplete="name"
          disabled={pending}
          placeholder="Seu nome"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfil-email">E-mail</Label>
        <Input
          id="perfil-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          disabled={pending}
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="perfil-email-ajuda"
        />
        <p id="perfil-email-ajuda" className="text-xs text-muted-foreground">
          Trocar o e-mail exige confirmação: enviamos um link para o endereço novo e ele só passa a
          valer depois que você clicar.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfil-telefone">
          Telefone <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="perfil-telefone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={pending}
          placeholder="(11) 90000-0000"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>

      {feedback && (
        <div
          className={
            feedback.type === 'ok'
              ? 'flex items-start gap-2 rounded-lg border border-success/25 bg-success/10 p-3'
              : 'flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3'
          }
          role="status"
        >
          {feedback.type === 'ok' ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}
          <p
            className={
              feedback.type === 'ok'
                ? 'text-sm text-muted-foreground'
                : 'text-sm text-destructive'
            }
          >
            {feedback.text}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending || !dirty}>
        {pending && <Loader2 className="animate-spin" />}
        Salvar alterações
      </Button>
    </form>
  )
}
