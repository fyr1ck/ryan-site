import type { Metadata } from 'next'

import { PageHeader } from '@/components/admin/page-header'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { PermissionNotice } from '../permission-notice'
import { AdminsManager, type AdminUserRow, type AllowlistRow } from './admins-manager'

export const metadata: Metadata = { title: 'Administração' }

interface UserRoleRow {
  user_id: string
  role: 'admin' | 'super_admin'
  created_at: string
}

interface ProfileRow {
  id: string
  email: string
  full_name: string | null
}

interface AllowlistDbRow {
  email: string
  role: 'admin' | 'super_admin'
  note: string | null
  created_at: string
}

export default async function AdminAccessPage() {
  const user = await getSessionUser()

  // Esta é a única tela do painel onde `admins.manage` é obrigatório: quem
  // gere acessos é só o super admin.
  if (!user?.permissions.has('admins.manage')) {
    return (
      <>
        <PageHeader title="Administração" />
        <PermissionNotice permission="admins.manage" what="a gestão de administradores" />
      </>
    )
  }

  const supabase = await createClient()

  const [{ data: rolesRaw }, { data: allowlistRaw }] = await Promise.all([
    supabase
      .from('user_roles')
      .select('user_id, role, created_at')
      .in('role', ['admin', 'super_admin'])
      .order('created_at', { ascending: true }),
    supabase
      .from('admin_allowlist')
      .select('email, role, note, created_at')
      .order('created_at', { ascending: false }),
  ])

  const roleRows = (rolesRaw ?? []) as unknown as UserRoleRow[]

  // ---------------------------------------------------------------------------
  // O "join" é feito aqui, em JS, e não no PostgREST.
  //
  // user_roles.user_id aponta para auth.users, não para profiles — sem chave
  // estrangeira entre as duas tabelas, o embed do PostgREST não existe. Duas
  // consultas e um Map resolvem sem inventar relação no banco.
  // ---------------------------------------------------------------------------
  const userIds = Array.from(new Set(roleRows.map((row) => row.user_id)))
  const profiles = new Map<string, ProfileRow>()

  if (userIds.length > 0) {
    const { data: profilesRaw } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    for (const profile of (profilesRaw ?? []) as unknown as ProfileRow[]) {
      profiles.set(profile.id, profile)
    }
  }

  // Uma linha por pessoa. Quem tiver os dois papéis aparece como super admin —
  // é o papel que manda, e mostrar a mesma pessoa duas vezes só confundiria.
  const byUser = new Map<string, AdminUserRow>()

  for (const row of roleRows) {
    const profile = profiles.get(row.user_id)
    const current = byUser.get(row.user_id)

    if (current && current.role === 'super_admin') continue

    byUser.set(row.user_id, {
      userId: row.user_id,
      email: profile?.email ?? 'conta sem perfil',
      fullName: profile?.full_name ?? null,
      role: row.role,
      grantedAt: row.created_at,
    })
  }

  const admins = Array.from(byUser.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role === 'super_admin' ? -1 : 1
    return a.email.localeCompare(b.email, 'pt-BR')
  })

  const allowlist: AllowlistRow[] = ((allowlistRaw ?? []) as unknown as AllowlistDbRow[]).map(
    (entry) => ({
      email: entry.email,
      role: entry.role,
      note: entry.note,
      createdAt: entry.created_at,
    })
  )

  return (
    <>
      <PageHeader
        title="Administração"
        description="Quem entra no painel, com qual papel, e quem entra automaticamente no primeiro login."
      />

      <AdminsManager admins={admins} allowlist={allowlist} currentUserId={user.id} />
    </>
  )
}
