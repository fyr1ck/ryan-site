import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next injeta scripts inline; em dev o HMR precisa de eval
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // O QR do Pix da MisticPay vem como data URI base64 (qrCodeBase64), coberto
  // pelo `data:` abaixo — não há host de gateway a liberar. A Stripe hospedava
  // a imagem e exigia o domínio dela aqui; isso saiu junto com a integração.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // A API do gateway é chamada do SERVIDOR, nunca do browser: nada a liberar.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export async function proxy(request: NextRequest) {
  const response = (await updateSession(request)) ?? NextResponse.next()

  response.headers.set('Content-Security-Policy', CSP_DIRECTIVES)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Tudo, menos estáticos, imagens e webhooks.
     *
     * Os webhooks ficam de fora de propósito: eles não têm sessão para renovar
     * e o gateway espera resposta rápida — passar pelo getUser() do Supabase só
     * somaria latência a cada evento. A autenticação deles é própria (token na
     * URL + confirmação na API do gateway), não depende de cookie.
     */
    '/((?!_next/static|_next/image|favicon.ico|placeholders|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
