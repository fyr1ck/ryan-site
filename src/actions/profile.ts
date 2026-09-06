'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// =============================================================================
// Perfil do cliente.
//
// Usa o client de servidor COM a sessão (RLS ativo), nunca o service_role: a
// policy `profiles_update_own` já garante que ninguém edita a linha de outro.
// O `.eq('id', user.id)` continua aqui porque o update sem filtro tentaria a
// tabela inteira e o RLS só o salvaria por sorte de policy.
//
// E-MAIL: profiles.email é ESPELHO de auth.users.email — o trigger
// handle_user_email_change() reescreve a coluna quando o e-mail da conta muda.
// Gravar direto em profiles.email passaria sem erro e seria desfeito na
// próxima troca, além de deixar login e cadastro apontando para endereços
// diferentes. Por isso a troca de e-mail vai por auth.updateUser(), que exige
// confirmação no endereço novo.
// =============================================================================

/** Campo de formulário: "" e espaços em branco viram undefined antes de validar. */
function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const updateProfileSchema = z.object({
  full_name: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
      .max(120, 'O nome pode ter no máximo 120 caracteres.')
      .optional()
  ),

  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(8, 'Telefone curto demais.')
      .max(24, 'Telefone longo demais.')
      .regex(/^[0-9()+\-.\s]+$/, 'Use apenas números, espaços e os sinais + ( ) -.')
      .optional()
  ),

  email: z.preprocess(
    (value) => {
      const normalized = emptyToUndefined(value)
      return typeof normalized === 'string' ? normalized.toLowerCase() : normalized
    },
    z.email('Informe um e-mail válido.').max(160, 'E-mail longo demais.').optional()
  ),
})

export type UpdateProfileInput = z.input<typeof updateProfileSchema>

export interface UpdateProfileResult {
  ok: boolean
  error?: string
  /** Texto de sucesso já pronto para a tela. */
  message?: string
  /** True quando falta o cliente confirmar o novo e-mail na caixa dele. */
  emailPending?: boolean
}

export async function updateProfileAction(input: unknown): Promise<UpdateProfileResult> {
  // Fora de try/catch: requireUser() redireciona lançando NEXT_REDIRECT, e um
  // catch aqui engoliria o sinal de navegação.
  const user = await requireUser('/conta')

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Confira os dados informados.' }
  }
  const data = parsed.data

  try {
    const supabase = await createClient()

    // (a) Nome e telefone. Campo vazio limpa o valor — o formulário sempre
    // manda os dois, então undefined aqui significa "apagar".
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: data.full_name ?? null,
        phone: data.phone ?? null,
      })
      .eq('id', user.id)

    if (profileError) {
      console.error('[updateProfileAction:profile]', {
        code: profileError.code,
        message: profileError.message,
      })
      return { ok: false, error: 'Não foi possível salvar os seus dados agora. Tente de novo.' }
    }

    // (b) E-mail: só mexe se realmente mudou.
    const newEmail = data.email
    const changedEmail = newEmail !== undefined && newEmail !== user.email.toLowerCase()

    if (changedEmail) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail })

      if (emailError) {
        console.error('[updateProfileAction:email]', {
          code: emailError.code,
          status: emailError.status,
          message: emailError.message,
        })

        const known: Record<string, string> = {
          email_exists: 'Este e-mail já está em uso por outra conta.',
          email_address_invalid: 'Informe um e-mail válido.',
          over_email_send_rate_limit:
            'Já pedimos uma confirmação há pouco. Aguarde alguns minutos e tente de novo.',
        }

        revalidatePath('/conta')
        return {
          ok: false,
          error:
            known[emailError.code ?? ''] ??
            'Seus dados foram salvos, mas não foi possível trocar o e-mail agora.',
        }
      }

      revalidatePath('/conta')
      return {
        ok: true,
        emailPending: true,
        message:
          'Dados salvos. Enviamos um link de confirmação para o novo e-mail — ele só passa a valer depois que você confirmar.',
      }
    }

    revalidatePath('/conta')
    return { ok: true, message: 'Dados salvos.' }
  } catch (error) {
    console.error('[updateProfileAction]', error)
    return { ok: false, error: 'Não foi possível salvar os seus dados agora. Tente de novo.' }
  }
}
