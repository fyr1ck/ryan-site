import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission, AppRole } from '@/lib/types/database.types'

export interface SessionUser {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  roles: AppRole[]
  permissions: Set<AppPermission>
}

/**
 * Sessão + papéis + permissões, tudo lido do banco.
 *
 * `cache()` deduplica: várias chamadas no mesmo render batem no Supabase
 * uma vez só.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()

  // getUser valida o JWT no servidor do Supabase. getSession() apenas lê o
  // cookie e por isso não serve para decisão de autorização.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, email').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ])

  const roles = (roleRows ?? []).map((r) => r.role as AppRole)

  let permissions: AppPermission[] = []
  if (roles.length > 0) {
    const { data: permRows } = await supabase
      .from('role_permissions')
      .select('permission')
      .in('role', roles)
    permissions = (permRows ?? []).map((p) => p.permission as AppPermission)
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    fullName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    roles,
    permissions: new Set(permissions),
  }
})

export async function requireUser(nextPath = '/conta'): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return user
}

export function isAdmin(user: SessionUser | null): boolean {
  return !!user && (user.roles.includes('admin') || user.roles.includes('super_admin'))
}

export async function requireAdmin(nextPath = '/admin'): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`)
  if (!isAdmin(user)) redirect('/?erro=sem-permissao')
  return user
}

/**
 * Guard de permissão granular para Server Actions.
 * Lança em vez de redirecionar — quem chama decide como reportar.
 */
export async function requirePermission(permission: AppPermission): Promise<SessionUser> {
  const user = await getSessionUser()

  if (!user) {
    throw new Error('Você precisa estar autenticado.')
  }
  if (!user.permissions.has(permission)) {
    throw new Error(`Sem permissão para "${permission}".`)
  }
  return user
}

export function can(user: SessionUser | null, permission: AppPermission): boolean {
  return !!user?.permissions.has(permission)
}
