import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

/**
 * Volta do magic link e do OAuth.
 *
 * Troca o `code` por sessão (o client de servidor grava os cookies do Supabase
 * na resposta) e devolve o visitante para onde ele estava.
 *
 * Sobre o destino: NUNCA se redireciona para o que veio de fora sem conferir.
 * `next` só é aceito como caminho relativo desta origem — "//site.com" e
 * "https://site.com" viram "/". Sem isso, um link de login manipulado levaria
 * a sessão recém-criada para um domínio de terceiro.
 */

const NEXT_COOKIE = 'rs-auth-next'

// O handler mexe em cookie de sessão: não pode ser pré-renderizado nem cacheado.
export const dynamic = 'force-dynamic'

/** Tipos de OTP que este callback aceita verificar por token_hash. */
const OTP_TYPES: EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email']

/** Só caminho interno. Qualquer outra coisa cai na home. */
function safeNext(value: string | null | undefined): string {
  if (!value) return '/'

  let path = value
  try {
    path = decodeURIComponent(value)
  } catch {
    return '/'
  }

  if (!path.startsWith('/')) return '/'
  if (path.startsWith('//')) return '/'
  if (path.includes('\\')) return '/'
  return path
}

/**
 * Base absoluta do redirect. Prefere a env (mesma fonte usada para montar o
 * redirectTo do provedor) e só cai no host do request quando ela não existe —
 * Host é cabeçalho controlado por quem chama.
 */
function siteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // env malformada: segue para o fallback.
    }
  }
  return request.nextUrl.origin
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, siteOrigin(request)))
  // O destino já foi consumido — o cookie não sobrevive ao login.
  response.cookies.set(NEXT_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}

function loginWithError(request: NextRequest, code: string): NextResponse {
  return redirectTo(request, `/login?erro=${encodeURIComponent(code)}`)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // O `next` da URL tem prioridade; o cookie é o que a tela de login guardou
  // antes de mandar o visitante para o provedor.
  const next = safeNext(searchParams.get('next') ?? request.cookies.get(NEXT_COOKIE)?.value)

  // (a) O provedor recusou antes mesmo de gerar código.
  const providerError = searchParams.get('error')
  if (providerError) {
    const errorCode = searchParams.get('error_code') ?? ''
    console.error('[auth/callback] provedor recusou', {
      error: providerError,
      code: errorCode,
      description: searchParams.get('error_description'),
    })
    if (errorCode === 'otp_expired') return loginWithError(request, 'link-expirado')
    return loginWithError(request, 'acesso-negado')
  }

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!code && !tokenHash) {
    return loginWithError(request, 'sem-codigo')
  }

  try {
    const supabase = await createClient()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession', {
          code: error.code,
          status: error.status,
          message: error.message,
        })
        const expired =
          error.code === 'flow_state_expired' || error.code === 'flow_state_not_found'
        return loginWithError(request, expired ? 'link-expirado' : 'link-invalido')
      }
    } else if (tokenHash) {
      // Caminho dos links de e-mail que chegam com token_hash em vez de code.
      const otpType = OTP_TYPES.includes(type as EmailOtpType)
        ? (type as EmailOtpType)
        : 'magiclink'

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
      if (error) {
        console.error('[auth/callback] verifyOtp', {
          code: error.code,
          status: error.status,
          message: error.message,
        })
        return loginWithError(request, error.code === 'otp_expired' ? 'link-expirado' : 'link-invalido')
      }
    }
  } catch (error) {
    console.error('[auth/callback]', error)
    return loginWithError(request, 'falha')
  }

  return redirectTo(request, next)
}
