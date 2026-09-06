'use client'

import * as React from 'react'
import Link from 'next/link'
import { Loader2, MailPlus, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import {
  addAllowlistEntryAction,
  promoteByEmailAction,
  removeAdminRoleAction,
  removeAllowlistEntryAction,
  setUserRoleAction,
} from '@/actions/admins'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, initials } from '@/lib/utils'

type AdminRole = 'admin' | 'super_admin'

const ROLE_LABEL: Record<AdminRole, string> = {
  admin: 'Administrador',
  super_admin: 'Super admin',
}

export interface AdminUserRow {
  userId: string
  email: string
  fullName: string | null
  role: AdminRole
  grantedAt: string
}

export interface AllowlistRow {
  email: string
  role: AdminRole
  note: string | null
  createdAt: string
}

export interface AdminsManagerProps {
  admins: AdminUserRow[]
  allowlist: AllowlistRow[]
  currentUserId: string
}

export function AdminsManager({ admins, allowlist, currentUserId }: AdminsManagerProps) {
  const superAdmins = admins.filter((admin) => admin.role === 'super_admin').length

  return (
    <div className="space-y-4">
      <HowItWorks />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Quem tem acesso ao painel ({admins.length})
          </CardTitle>
          <CardDescription>
            {superAdmins} super admin{superAdmins === 1 ? '' : 's'} · só super admin gere acessos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {admins.map((admin) => (
            <AdminRow
              key={admin.userId}
              admin={admin}
              isSelf={admin.userId === currentUserId}
              isLastSuperAdmin={admin.role === 'super_admin' && superAdmins <= 1}
            />
          ))}
        </CardContent>
      </Card>

      <PromoteForm />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus className="size-4 text-primary" />
            Allowlist ({allowlist.length})
          </CardTitle>
          <CardDescription>
            E-mails que viram administradores automaticamente no primeiro login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AllowlistForm />

          {allowlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum e-mail na lista.</p>
          ) : (
            <ul className="space-y-2">
              {allowlist.map((entry) => (
                <li key={entry.email}>
                  <AllowlistRowItem entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** A explicação que evita o mal-entendido mais caro desta tela. */
function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Como o acesso funciona</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Allowlist</strong> é para quem ainda NÃO tem conta.
          Quando essa pessoa entrar pela primeira vez, o banco já cria o papel escolhido — não é
          preciso fazer mais nada.
        </p>
        <p>
          <strong className="text-foreground">Promover</strong> é para quem JÁ tem conta na loja. A
          allowlist não muda o papel de quem já entrou: nesse caso use o campo de promoção.
        </p>
        <p>
          <strong className="text-foreground">Remover da allowlist não revoga acesso.</strong> Quem
          já virou admin continua admin; para tirar o acesso, use &ldquo;Remover acesso&rdquo; na
          lista de cima.
        </p>
        <p>
          <strong className="text-foreground">Super admin</strong> é o único que gere acessos
          (permissão admins.manage). O administrador comum opera a loja inteira, mas não promove
          ninguém — inclusive a si mesmo.
        </p>
      </CardContent>
    </Card>
  )
}

function AdminRow({
  admin,
  isSelf,
  isLastSuperAdmin,
}: {
  admin: AdminUserRow
  isSelf: boolean
  isLastSuperAdmin: boolean
}) {
  const [pending, startTransition] = React.useTransition()

  // A trava real está na Server Action; aqui ela só é antecipada para o botão
  // não parecer disponível quando o servidor vai recusar de qualquer jeito.
  const locked = (isSelf && admin.role === 'super_admin') || isLastSuperAdmin

  function handleRole(role: AdminRole) {
    if (role === admin.role) return
    startTransition(async () => {
      const result = await setUserRoleAction({ userId: admin.userId, role })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível alterar o papel.')
        return
      }
      toast.success(`Papel atualizado para ${ROLE_LABEL[role]}.`)
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initials(admin.fullName ?? admin.email)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium">
            <Link href={`/admin/clientes/${admin.userId}`} className="truncate hover:text-primary">
              {admin.fullName ?? admin.email}
            </Link>
            {isSelf && <Badge variant="secondary">você</Badge>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {admin.email} · desde {formatDate(admin.grantedAt)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={admin.role}
          onValueChange={(value) => handleRole(value as AdminRole)}
          disabled={pending || locked}
        >
          <SelectTrigger className="w-44" aria-label={`Papel de ${admin.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="super_admin">Super admin</SelectItem>
          </SelectContent>
        </Select>

        {locked ? (
          <Badge variant="muted">{isSelf ? 'protegido' : 'último dono'}</Badge>
        ) : (
          <ConfirmDelete
            title="Remover acesso ao painel?"
            description="A pessoa perde o painel mas continua cliente da loja: pedidos e histórico ficam intactos."
            confirmLabel="Remover acesso"
            onConfirm={async () => {
              const result = await removeAdminRoleAction(admin.userId)
              if (!result.ok) throw new Error(result.error ?? 'Não foi possível remover.')
              toast.success('Acesso removido.')
            }}
            trigger={
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover acesso">
                <Trash2 className="size-4" />
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}

/** Promoção de quem já tem conta. */
function PromoteForm() {
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<AdminRole>('admin')
  const [pending, startTransition] = React.useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (email.trim() === '') return

    startTransition(async () => {
      const result = await promoteByEmailAction({ email, role })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível promover.')
        return
      }
      setEmail('')
      toast.success('Papel aplicado.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          Promover um usuário existente
        </CardTitle>
        <CardDescription>Para contas que já entraram na loja pelo menos uma vez.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="promote-email">E-mail da conta</Label>
            <Input
              id="promote-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="pessoa@exemplo.com"
              disabled={pending}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="promote-role">Papel</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as AdminRole)}
              disabled={pending}
            >
              <SelectTrigger id="promote-role" className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="super_admin">Super admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={pending || email.trim() === ''}>
            {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Promover
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AllowlistForm() {
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<AdminRole>('admin')
  const [note, setNote] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (email.trim() === '') return

    startTransition(async () => {
      const result = await addAllowlistEntryAction({ email, role, note: note.trim() || null })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível adicionar o e-mail.')
        return
      }
      setEmail('')
      setNote('')
      toast.success('E-mail adicionado à allowlist.')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="allow-email">E-mail</Label>
        <Input
          id="allow-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="novo.admin@exemplo.com"
          disabled={pending}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="allow-role">Papel</Label>
        <Select
          value={role}
          onValueChange={(value) => setRole(value as AdminRole)}
          disabled={pending}
        >
          <SelectTrigger id="allow-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="super_admin">Super admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={pending || email.trim() === ''}>
        {pending ? <Loader2 className="animate-spin" /> : <MailPlus />}
        Adicionar
      </Button>

      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="allow-note">Observação (opcional)</Label>
        <Input
          id="allow-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          disabled={pending}
          placeholder="Suporte contratado em setembro"
        />
      </div>
    </form>
  )
}

function AllowlistRowItem({ entry }: { entry: AllowlistRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{entry.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ROLE_LABEL[entry.role]} · adicionado em {formatDate(entry.createdAt)}
          {entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>

      <ConfirmDelete
        title="Remover da allowlist?"
        description="Se essa pessoa ainda não entrou, ela deixa de virar admin no primeiro login. Se já entrou, o acesso dela NÃO é revogado por aqui."
        confirmLabel="Remover"
        onConfirm={async () => {
          const result = await removeAllowlistEntryAction(entry.email)
          if (!result.ok) throw new Error(result.error ?? 'Não foi possível remover.')
          toast.success('E-mail removido da allowlist.')
        }}
        trigger={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover da allowlist">
            <Trash2 className="size-4" />
          </Button>
        }
      />
    </div>
  )
}
