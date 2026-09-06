import { createBrowserClient } from '@supabase/ssr'

/**
 * Client do browser. Usa apenas a chave publishable (anon).
 * Tudo que passa por aqui é filtrado por RLS no banco.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
