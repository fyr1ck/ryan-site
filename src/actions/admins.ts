'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission, type SessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AppPermission, AppRole } from '@/lib/types/database.types'

// =============================================================================
// ADMINISTRAÇÃO DE ADMINISTRADORES
// -----------------------------------------------------------------------------
// Tudo aqui exige `admins.manage`, que só o super_admin tem (0001). Um admin
// comum não se promove nem promove ninguém — é o que impede que uma conta de
// operação comprometida vire dono da loja.
//
// Client de sessão em tudo: as policies user_roles_super_write e
// admin_allowlist_super (0007) já exigem admins.manage no banco. Se um dia
// alguém esquecer o requirePermission aqui, o RLS ainda recusa a escrita.
//
// COMO A ALLOWLIST FUNCIONA (a tela repete isso para o usuário):
// admin_allowlist guarda e-mails que ainda NÃO têm conta. Quando essa pessoa
// faz o primeiro login, o trigger handle_new_user() consulta a lista e já cria
// o papel. Adicionar à allowlist alguém que JÁ tem conta não faz nada sozinho —
// nesse caso o caminho é promover o usuário existente.
// =============================================================================

export interface ActionResult {
  ok: boolean
  error?: string
}

/** Papéis administrativos. `customer` não é gerido por esta tela. */
type AdminRole = Extract<AppRole, 'admin' | 'super_admin'>

const ROLE_LABEL: Record<AdminRole, string> = {
  admin: 'Administrador',
  super_admin: 'Super admin',
}

async function authorize(
  permission: AppPermission
): Promise<{ user: SessionUser } | { error: string }> {
  try {
    return { user: await requirePermission(permission) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sem permissão para esta ação.' }
  }
}

async function logAction(
  actorId: string,
  action: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('log_admin_action', {
      p_actor_id: actorId,
      p_action: action,
      p_entity_type: 'admin_access',
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    })
  } catch (error) {
    console.error('[log_admin_action:admins]', action, error)
  }
}

function firstIssue(error: z.ZodError, fallback = 'Dados inválidos.'): string {
  return error.issues[0]?.message ?? fallback
}

function revalidateAdmins(): void {
  revalidatePath('/admin/administracao')
}

/**
 * Quantos super_admins existem hoje.
 *
 * É a trava que sustenta todas as proteções abaixo: a loja não pode ficar sem
 * ninguém capaz de gerir acessos. Se ficasse, a única saída seria mexer no
 * banco à mão — e é exatamente essa situação que estas regras evitam.
 */
async function countSuperAdmins(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('user_roles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')

  return count ?? 0
}

// =============================================================================
// 1. ALLOWLIST — ADICIONAR
// =============================================================================
const allowlistSchema = z.object({
  email: z
    .email('Informe um e-mail válido.')
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => value.length <= 254, 'E-mail longo demais.'),
  role: z.enum(['admin', 'super_admin'], 'Escolha o papel.'),
  note: z
    .string()
    .trim()
    .max(200, 'A observação pode ter no máximo 200 caracteres.')
    .nullish()
    .transform((value) => (value ? value : null)),
})

export async function addAllowlistEntryAction(input: unknown): Promise<ActionResult> {
  const parsed = allowlistSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('admins.manage')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    // upsert: reeditar o papel de um e-mail já listado é o caso normal de uso.
    const { error } = await supabase
      .from('admin_allowlist')
      .upsert(
        { email: parsed.data.email, role: parsed.data.role, note: parsed.data.note },
        { onConflict: 'email' }
      )

    if (error) {
      console.error('[addAllowlistEntryAction]', error)
      return { ok: false, error: 'Não foi possível salvar o e-mail na lista.' }
    }

    await logAction(
      auth.user.id,
      'admin.allowlist_add',
      parsed.data.email,
      `Adicionou ${parsed.data.email} à allowlist como ${ROLE_LABEL[parsed.data.role]}.`,
      { email: parsed.data.email, role: parsed.data.role }
    )

    revalidateAdmins()
    return { ok: true }
  } catch (error) {
    console.error('[addAllowlistEntryAction]', error)
    return { ok: false, error: 'Não foi possível salvar o e-mail agora.' }
  }
}

// =============================================================================
// 2. ALLOWLIST — REMOVER
// =============================================================================
/**
 * Tirar da allowlist NÃO rebaixa quem já entrou: o papel dessa pessoa já está
 * em user_roles. A lista só decide o que acontece no PRIMEIRO login. A tela diz
 * isso em voz alta para ninguém achar que revogou um acesso e não ter revogado.
 */
export async function removeAllowlistEntryAction(email: unknown): Promise<ActionResult> {
  const parsed = z.email('E-mail inválido.').safeParse(email)
  if (!parsed.success) return { ok: false, error: 'E-mail inválido.' }

  const auth = await authorize('admins.manage')
  if ('error' in auth) return { ok: false, error: auth.error }

  const target = parsed.data.trim().toLowerCase()

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('admin_allowlist').delete().eq('email', target)

    if (error) {
      console.error('[removeAllowlistEntryAction]', error)
      return { ok: false, error: 'Não foi possível remover o e-mail da lista.' }
    }

    await logAction(
      auth.user.id,
      'admin.allowlist_remove',
      target,
      `Removeu ${target} da allowlist.`,
      { email: target }
    )

    revalidateAdmins()
    return { ok: true }
  } catch (error) {
    console.error('[removeAllowlistEntryAction]', error)
    return { ok: false, error: 'Não foi possível remover o e-mail agora.' }
  }
}

// =============================================================================
// 3. PROMOVER / REBAIXAR UM USUÁRIO EXISTENTE
// =============================================================================
const setRoleSchema = z.object({
  userId: z.uuid('Usuário inválido.'),
  role: z.enum(['admin', 'super_admin'], 'Escolha o papel.'),
})

/**
 * Define o papel administrativo de uma conta que já existe.
 *
 * O modelo é "um papel administrativo por pessoa": ao aplicar `admin`, o papel
 * `super_admin` sai, e vice-versa. `customer` fica intocado — todo mundo
 * continua sendo cliente da própria loja.
 */
export async function setUserRoleAction(input: unknown): Promise<ActionResult> {
  const parsed = setRoleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('admins.manage')
  if ('error' in auth) return { ok: false, error: auth.error }

  return applyRole(auth.user, parsed.data.userId, parsed.data.role)
}

const promoteByEmailSchema = z.object({
  email: z.email('Informe um e-mail válido.').transform((value) => value.trim().toLowerCase()),
  role: z.enum(['admin', 'super_admin'], 'Escolha o papel.'),
})

/**
 * Promove alguém que JÁ tem conta, buscando pelo e-mail.
 *
 * É o caminho para o caso mais comum na prática: a pessoa já é cliente da loja
 * e agora vai operar o painel. Quem ainda não tem conta não aparece em
 * `profiles` — para essa, o caminho é a allowlist, e o erro diz isso.
 */
export async function promoteByEmailAction(input: unknown): Promise<ActionResult> {
  const parsed = promoteByEmailSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const auth = await authorize('admins.manage')
  if ('error' in auth) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', parsed.data.email)
      .maybeSingle()

    if (!profile) {
      return {
        ok: false,
        error:
          'Nenhuma conta com esse e-mail. Adicione-o à allowlist: ele vira admin sozinho no primeiro login.',
      }
    }

    return applyRole(auth.user, profile.id as string, parsed.data.role)
  } catch (error) {
    console.error('[promoteByEmailAction]', error)
    return { ok: false, error: 'Não foi possível promover esta conta agora.' }
  }
}

/** Núcleo compartilhado por setUserRoleAction e promoteByEmailAction. */
async function applyRole(actor: SessionUser, userId: string, role: AdminRole): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      return {
        ok: false,
        error: 'Esta conta ainda não existe. Use a allowlist para que ela vire admin no primeiro login.',
      }
    }

    const { data: currentRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)

    const roles = (currentRoles ?? []).map((row) => row.role as AppRole)
    if (roles.includes(role)) return { ok: true }

    const losingSuper = roles.includes('super_admin')

    // ---- Proteção 1: ninguém tira o próprio super_admin -------------------
    // Rebaixar-se a admin é remover o próprio super_admin com outro nome.
    if (losingSuper && userId === actor.id) {
      return {
        ok: false,
        error:
          'Você não pode rebaixar o seu próprio super admin. Peça a outro super admin, ou promova alguém antes de sair.',
      }
    }

    // ---- Proteção 2: a loja não pode ficar sem dono -----------------------
    if (losingSuper && (await countSuperAdmins()) <= 1) {
      return {
        ok: false,
        error: 'Este é o último super admin da loja. Promova outra pessoa antes de rebaixá-lo.',
      }
    }

    const other: AdminRole = role === 'admin' ? 'super_admin' : 'admin'

    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', other)

    if (deleteError) {
      console.error('[applyRole:delete]', deleteError)
      return { ok: false, error: 'Não foi possível atualizar o papel.' }
    }

    const { error: insertError } = await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role, granted_by: actor.id }, { onConflict: 'user_id,role' })

    if (insertError) {
      console.error('[applyRole:insert]', insertError)
      return { ok: false, error: 'Não foi possível atualizar o papel.' }
    }

    await logAction(
      actor.id,
      'admin.set_role',
      userId,
      `Definiu ${profile.email} como ${ROLE_LABEL[role]}.`,
      { email: profile.email, role, previous_roles: roles }
    )

    revalidateAdmins()
    return { ok: true }
  } catch (error) {
    console.error('[applyRole]', error)
    return { ok: false, error: 'Não foi possível atualizar o papel agora.' }
  }
}

// =============================================================================
// 4. REMOVER O ACESSO ADMINISTRATIVO
// =============================================================================
/**
 * Tira `admin` e `super_admin` da conta. O papel `customer` permanece: a pessoa
 * continua conseguindo comprar e ver os próprios pedidos, só perde o painel.
 */
export async function removeAdminRoleAction(userId: unknown): Promise<ActionResult> {
  const parsed = z.uuid('Usuário inválido.').safeParse(userId)
  if (!parsed.success) return { ok: false, error: 'Usuário inválido.' }

  const auth = await authorize('admins.manage')
  if ('error' in auth) return { ok: false, error: auth.error }

  const target = parsed.data

  try {
    const supabase = await createClient()

    const { data: currentRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', target)

    const roles = (currentRoles ?? []).map((row) => row.role as AppRole)
    const isSuper = roles.includes('super_admin')

    if (!isSuper && !roles.includes('admin')) {
      return { ok: false, error: 'Esta conta já não tem acesso administrativo.' }
    }

    // ---- Proteção 1: ninguém tira o próprio super_admin -------------------
    if (isSuper && target === auth.user.id) {
      return {
        ok: false,
        error:
          'Você não pode remover o seu próprio papel de super admin — a loja ficaria sem dono. Promova outro super admin primeiro.',
      }
    }

    // ---- Proteção 2: a loja não pode ficar sem dono -----------------------
    if (isSuper && (await countSuperAdmins()) <= 1) {
      return {
        ok: false,
        error: 'Este é o último super admin da loja. Promova outra pessoa antes de remover o acesso.',
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', target)
      .maybeSingle()

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', target)
      .in('role', ['admin', 'super_admin'])

    if (error) {
      console.error('[removeAdminRoleAction]', error)
      return { ok: false, error: 'Não foi possível remover o acesso.' }
    }

    await logAction(
      auth.user.id,
      'admin.remove_role',
      target,
      `Removeu o acesso administrativo de ${profile?.email ?? target}.`,
      { email: profile?.email ?? null, previous_roles: roles }
    )

    revalidateAdmins()
    return { ok: true }
  } catch (error) {
    console.error('[removeAdminRoleAction]', error)
    return { ok: false, error: 'Não foi possível remover o acesso agora.' }
  }
}
