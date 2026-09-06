import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renova a sessão a cada request e protege /admin e /conta.
 *
 * A checagem de admin é feita contra o banco (user_roles), nunca contra
 * uma lista de e-mails no código.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() revalida o token no servidor Supabase. Não trocar por
  // getSession(), que confia no cookie sem verificar assinatura.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (path.startsWith('/admin') && path !== '/admin/login') {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }

    const { data: isAdmin } = await supabase.rpc('is_admin')

    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('erro', 'sem-permissao')
      return NextResponse.redirect(url)
    }
  }

  if (path.startsWith('/conta') && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
