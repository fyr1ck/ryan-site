import { NextResponse } from 'next/server'
import { PUBLIC_ENV_VARS, missingPublicEnv } from '@/lib/env'

/**
 * Diagnóstico de implantação.
 *
 * Route Handler de propósito: não passa pelo layout raiz, então continua
 * respondendo mesmo quando todas as páginas estão em 500 — que é exatamente
 * quando se precisa dele.
 *
 * Reporta apenas a PRESENÇA de cada variável, nunca o valor. Saber que
 * STRIPE_SECRET_KEY existe não ajuda ninguém a usá-la; saber que ela falta
 * economiza uma hora de investigação.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function presenca(nome: string): boolean {
  const valor = process.env[nome]
  return typeof valor === 'string' && valor.trim() !== ''
}

export async function GET() {
  const faltando = missingPublicEnv()

  const env: Record<string, boolean> = {}
  for (const nome of PUBLIC_ENV_VARS) env[nome] = presenca(nome)
  env.NEXT_PUBLIC_SITE_URL = presenca('NEXT_PUBLIC_SITE_URL')
  env.SUPABASE_SERVICE_ROLE_KEY = presenca('SUPABASE_SERVICE_ROLE_KEY')
  env.STRIPE_SECRET_KEY = presenca('STRIPE_SECRET_KEY')
  env.STRIPE_WEBHOOK_SECRET = presenca('STRIPE_WEBHOOK_SECRET')

  // Testa a conexão real com o banco pela chave pública. Só a contagem sai
  // daqui — nenhum dado de loja, nenhum dado de cliente.
  let banco: { ok: boolean; detalhe: string } = { ok: false, detalhe: 'nao testado' }

  if (faltando.length === 0) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')

      banco = error
        ? { ok: false, detalhe: `${error.code ?? ''} ${error.message}`.trim() }
        : { ok: true, detalhe: `${count ?? 0} produtos ativos` }
    } catch (erro) {
      banco = { ok: false, detalhe: erro instanceof Error ? erro.message : 'erro desconhecido' }
    }
  } else {
    banco = { ok: false, detalhe: `faltam variaveis: ${faltando.join(', ')}` }
  }

  const saudavel = faltando.length === 0 && banco.ok

  // Nomes de variáveis que PARECEM ser deste projeto, para pegar erro de
  // digitação: um espaço no fim ou "SERVICE_ROLE" sem o "_KEY" cria uma
  // variável diferente, que some sem avisar. Só os NOMES saem daqui —
  // e apenas os que casam com os prefixos do projeto, para não listar o
  // ambiente inteiro da plataforma.
  const detectadas = Object.keys(process.env)
    .filter((k) => /SUPABASE|STRIPE|NEXT_PUBLIC/i.test(k))
    .map((k) => (k === k.trim() ? k : `${k}  <-- TEM ESPACO NO NOME`))
    .sort()

  return NextResponse.json(
    {
      ok: saudavel,
      env,
      variaveis_publicas_faltando: faltando,
      nomes_detectados: detectadas,
      banco,
      node: process.version,
      regiao: process.env.VERCEL_REGION ?? 'local',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      // Muda a cada deploy: prova se o redeploy realmente entrou no ar.
      deploy: process.env.VERCEL_DEPLOYMENT_ID?.slice(-8) ?? 'local',
    },
    { status: saudavel ? 200 : 503 }
  )
}
