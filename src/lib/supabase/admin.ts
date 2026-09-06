import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Client com service_role: IGNORA RLS por completo.
 *
 * Regras de uso:
 *  - Nunca importar em Client Component (o `server-only` acima quebra o build
 *    se alguém tentar).
 *  - Só usar onde a autorização já foi verificada explicitamente no código,
 *    ou em rotas de sistema (webhook de pagamento).
 *  - Toda leitura feita por aqui perde o filtro do RLS: o filtro precisa ser
 *    reposto à mão na query (ex.: .eq('user_id', user.id)).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key || key === 'COLE_AQUI_A_SERVICE_ROLE_KEY') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada. ' +
        'Pegue em Supabase Dashboard > Project Settings > API > service_role ' +
        'e coloque no .env.local.'
    )
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
