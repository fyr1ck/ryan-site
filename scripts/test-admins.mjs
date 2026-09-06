#!/usr/bin/env node
/**
 * Confere QUEM tem acesso ao painel administrativo.
 *
 * O link "Painel administrativo" e a rota /admin dependem do papel gravado em
 * user_roles. Uma migration nova, um INSERT manual ou uma policy mal escrita
 * podem conceder esse papel a mais alguém sem gerar erro nenhum — a loja
 * continua funcionando e o painel fica aberto para quem não devia.
 *
 * Este script falha quando a lista de admins não é exatamente a esperada.
 *
 *   node scripts/test-admins.mjs
 *
 * Precisa da SUPABASE_SERVICE_ROLE_KEY: ler user_roles de outras pessoas é,
 * por desenho, algo que o RLS proíbe à chave anônima.
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnv, exigir } from './load-env.mjs'

const env = exigir(loadEnv(), ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])

/** Quem PODE administrar a loja. Mudou aqui? Mudou de propósito. */
const ESPERADOS = {
  'pedro07shopify@gmail.com': 'super_admin',
  'armabritanica@gmail.com': 'admin',
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let problemas = 0

console.log('\nQuem administra a loja\n')

// 1) A allowlist: quem vira admin automaticamente ao se cadastrar
const { data: allowlist, error: erroAllow } = await supabase
  .from('admin_allowlist')
  .select('email, role')
  .order('email')

if (erroAllow) {
  console.error('  ERRO ao ler admin_allowlist:', erroAllow.message)
  process.exit(1)
}

console.log('Allowlist (vira admin no primeiro login):')
for (const linha of allowlist ?? []) {
  const esperado = ESPERADOS[linha.email.toLowerCase()]
  if (!esperado) {
    problemas++
    console.log(`  INESPERADO  ${linha.email} (${linha.role}) — não está na lista deste script`)
  } else if (esperado !== linha.role) {
    problemas++
    console.log(`  PAPEL ERRADO  ${linha.email}: esperado ${esperado}, encontrado ${linha.role}`)
  } else {
    console.log(`  ok  ${linha.email} -> ${linha.role}`)
  }
}

for (const email of Object.keys(ESPERADOS)) {
  if (!(allowlist ?? []).some((l) => l.email.toLowerCase() === email)) {
    problemas++
    console.log(`  AUSENTE  ${email} deveria estar na allowlist`)
  }
}

// 2) Quem de fato TEM o papel hoje — é isto que abre o painel
const { data: papeis, error: erroPapeis } = await supabase
  .from('user_roles')
  .select('role, profiles!inner(email)')
  .in('role', ['admin', 'super_admin'])

if (erroPapeis) {
  console.error('\n  ERRO ao ler user_roles:', erroPapeis.message)
  process.exit(1)
}

console.log('\nContas com papel de administrador agora:')

if (!papeis || papeis.length === 0) {
  console.log('  (nenhuma ainda — ninguém da allowlist fez o primeiro login)')
} else {
  for (const linha of papeis) {
    const email = (linha.profiles?.email ?? '').toLowerCase()
    const esperado = ESPERADOS[email]
    if (!esperado) {
      problemas++
      console.log(`  INTRUSO  ${email} tem ${linha.role} e NÃO deveria`)
    } else if (esperado !== linha.role) {
      problemas++
      console.log(`  PAPEL ERRADO  ${email}: esperado ${esperado}, encontrado ${linha.role}`)
    } else {
      console.log(`  ok  ${email} -> ${linha.role}`)
    }
  }
}

// 3) Ninguém além dos previstos pode ter permissão de gerir outros admins
const { data: gestores } = await supabase
  .from('user_roles')
  .select('role, profiles!inner(email)')
  .eq('role', 'super_admin')

const superAdminsEsperados = Object.entries(ESPERADOS)
  .filter(([, papel]) => papel === 'super_admin')
  .map(([email]) => email)

console.log('\nQuem pode promover/remover administradores:')
for (const g of gestores ?? []) {
  const email = (g.profiles?.email ?? '').toLowerCase()
  const ok = superAdminsEsperados.includes(email)
  if (!ok) problemas++
  console.log(`  ${ok ? 'ok' : 'INTRUSO'}  ${email}`)
}
if ((gestores ?? []).length === 0) console.log('  (nenhum ainda)')

console.log(
  problemas === 0
    ? '\nTudo certo: só os administradores previstos têm acesso.\n'
    : `\n${problemas} divergência(s) encontrada(s).\n`
)

process.exit(problemas === 0 ? 0 : 1)
