#!/usr/bin/env node
/**
 * Materializa em supabase/migrations/ o SQL que já foi aplicado no banco.
 *
 * O Supabase guarda cada migration aplicada em supabase_migrations.schema_migrations.
 * Este script lê essa tabela e reescreve os arquivos locais, garantindo que o
 * repositório reflita exatamente o que está no banco.
 *
 * Uso:
 *   node scripts/dump-migrations.mjs
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL no .env.local.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, exigir } from './load-env.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = exigir(loadEnv(), ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key || key.startsWith('COLE_AQUI')) {
  console.error(
    'Configure SUPABASE_SERVICE_ROLE_KEY no .env.local.\n' +
      'Dashboard > Project Settings > API > service_role'
  )
  process.exit(1)
}

// A tabela vive no schema supabase_migrations, que não é exposto pelo PostgREST
// por padrão. Usamos a RPC de query bruta do endpoint de plataforma.
const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query:
      'select version, name, statements from supabase_migrations.schema_migrations order by version',
  }),
}).catch(() => null)

if (!response || !response.ok) {
  console.error(
    'Não foi possível ler as migrations pela API.\n' +
      'Alternativa: use o Supabase CLI, que faz isso nativamente:\n\n' +
      '  npx supabase link --project-ref <ref>\n' +
      '  npx supabase db pull\n'
  )
  process.exit(1)
}

const rows = await response.json()
const dir = join(root, 'supabase', 'migrations')
mkdirSync(dir, { recursive: true })

for (const row of rows) {
  const filename = `${row.version}_${row.name}.sql`
  const sql = Array.isArray(row.statements) ? row.statements.join(';\n\n') : row.statements
  writeFileSync(join(dir, filename), `${sql}\n`, 'utf8')
  console.log(`escrito: ${filename}`)
}

console.log(`\n${rows.length} migrations materializadas em supabase/migrations/`)
