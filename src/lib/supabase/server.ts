import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client de servidor com a sessão do usuário (cookies).
 * Continua sujeito ao RLS — é o client certo para ler dados do próprio usuário.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component não pode escrever cookie. O middleware já
            // renova a sessão, então ignorar aqui é seguro.
          }
        },
      },
    }
  )
}
