'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

// =============================================================================
// Login sem senha (magic link) e OAuth.
//
// Sempre o client de servidor com cookies: é ele que grava a sessão do Supabase
// no cookie da resposta. O createAdminClient() não tem nada a ver com login.
// =============================================================================

const OAUTH_PROVIDERS = ['google', 'discord'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

/**
 * URL de volta depois do e-mail / do provedor.
 *
 * Vem de env, nunca de header (Host é controlado por quem faz o request: aceitar
 * o que chega ali é entregar o link de login para o domínio do atacante).
 */
function authCallbackUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/auth/callback`
}

const otpSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email('Informe um e-mail válido.').max(160, 'E-mail longo demais.')
  ),
})

const providerSchema = z.enum(OAUTH_PROVIDERS, 'Provedor de login não suportado.')

export type SignInWithOtpInput = z.input<typeof otpSchema>

export interface SignInWithOtpResult {
  ok: boolean
  error?: string
  email?: string
}

export interface SignInWithOAuthResult {
  ok: boolean
  error?: string
  url?: string
}

interface AuthErrorLike {
  code?: string | null
  status?: number | null
  message?: string | null
}

/**
 * Mensagens do Supabase Auth vêm em inglês e às vezes contam demais sobre a
 * conta ("user not found" diz quem é cliente). Traduz e generaliza.
 */
function translateAuthError(error: AuthErrorLike, fallback: string): string {
  const code = error.code ?? ''
  const status = error.status ?? 0

  const known: Record<string, string> = {
    over_email_send_rate_limit:
      'Já enviamos um link há pouco. Confira sua caixa de entrada e aguarde alguns minutos.',
    over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    email_address_invalid: 'Informe um e-mail válido.',
    email_address_not_authorized: 'Este e-mail não está autorizado a entrar.',
    signup_disabled: 'Novos cadastros estão desativados no momento.',
    email_provider_disabled: 'O login por e-mail está desativado no momento.',
    provider_disabled: 'Este provedor de login está desativado no momento.',
    validation_failed: 'Informe um e-mail válido.',
  }

  if (known[code]) return known[code]
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'

  console.error('[auth]', { code, status, message: error.message })
  return fallback
}

/** Envia o magic link (OTP por e-mail). */
export async function signInWithOtp(input: unknown): Promise<SignInWithOtpResult> {
  const parsed = otpSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.' }
  }
  const { email } = parsed.data

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authCallbackUrl() },
    })

    if (error) {
      return {
        ok: false,
        error: translateAuthError(error, 'Não foi possível enviar o link de acesso. Tente de novo.'),
      }
    }

    return { ok: true, email }
  } catch (error) {
    console.error('[signInWithOtp]', error)
    return { ok: false, error: 'Não foi possível enviar o link de acesso. Tente de novo.' }
  }
}

/**
 * Monta a URL de autorização do provedor e devolve para a página navegar.
 *
 * `skipBrowserRedirect` porque no servidor não existe browser para redirecionar:
 * sem ele o supabase-js devolveria url vazia.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<SignInWithOAuthResult> {
  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) {
    return { ok: false, error: 'Provedor de login não suportado.' }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: parsed.data,
      options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true },
    })

    if (error) {
      return {
        ok: false,
        error: translateAuthError(error, 'Não foi possível iniciar o login. Tente de novo.'),
      }
    }

    if (!data?.url) {
      console.error('[signInWithOAuth] resposta sem url', { provider: parsed.data })
      return { ok: false, error: 'Não foi possível iniciar o login. Tente de novo.' }
    }

    return { ok: true, url: data.url }
  } catch (error) {
    console.error('[signInWithOAuth]', error)
    return { ok: false, error: 'Não foi possível iniciar o login. Tente de novo.' }
  }
}

/** Encerra a sessão e volta para a home. */
export async function signOutAction(): Promise<never> {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch (error) {
    // Sair não pode falhar na cara do usuário. Se o Supabase não responder, o
    // cookie continua e o middleware derruba a sessão no próximo request.
    console.error('[signOutAction]', error)
  }

  // Header e menu de conta são renderizados no layout; sem isso a versão em
  // cache continuaria mostrando o usuário logado.
  revalidatePath('/', 'layout')

  // redirect() lança NEXT_REDIRECT de propósito — fica FORA do try acima para o
  // catch não engolir o sinal de navegação.
  redirect('/')
}
