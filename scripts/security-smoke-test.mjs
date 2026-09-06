#!/usr/bin/env node
/**
 * Smoke test de segurança do RLS.
 *
 * Conecta com a chave ANÔNIMA — a mesma que qualquer visitante extrai do
 * JavaScript da página — e tenta alcançar o que não deveria. Cada teste
 * descreve o ataque e o resultado esperado.
 *
 * Rode isto depois de TODA migration. Uma policy nova, ou uma RPC
 * SECURITY DEFINER esquecida, abre buraco sem gerar erro em lugar nenhum:
 * o sistema continua funcionando e vazando em silêncio.
 *
 *   node scripts/security-smoke-test.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnv, exigir } from './load-env.mjs'

const env = exigir(loadEnv(), ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

let passed = 0
let failed = 0

/**
 * @param {string} nome      o que está sendo tentado
 * @param {() => Promise<{ok: boolean, detalhe: string}>} fn
 */
async function teste(nome, fn) {
  try {
    const { ok, detalhe } = await fn()
    if (ok) {
      passed++
      console.log(`  PASSOU  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
    } else {
      failed++
      console.log(`  FALHOU  ${nome} — ${detalhe}`)
    }
  } catch (err) {
    failed++
    console.log(`  ERRO    ${nome} — ${err.message}`)
  }
}

console.log('\nSmoke test de segurança — conectado como visitante anônimo\n')

console.log('Leitura pública que DEVE funcionar:')

await teste('produtos ativos são visíveis', async () => {
  const { data, error } = await supabase.from('products').select('id, name').eq('status', 'active')
  if (error) return { ok: false, detalhe: error.message }
  return { ok: data.length > 0, detalhe: `${data.length} produtos` }
})

await teste('categorias ativas são visíveis', async () => {
  const { data, error } = await supabase.from('categories').select('id')
  if (error) return { ok: false, detalhe: error.message }
  return { ok: data.length > 0, detalhe: `${data.length} categorias` }
})

await teste('páginas publicadas são visíveis', async () => {
  const { data, error } = await supabase.from('pages').select('slug')
  if (error) return { ok: false, detalhe: error.message }
  return { ok: data.length > 0, detalhe: `${data.length} páginas` }
})

console.log('\nDados sensíveis que NÃO podem vazar:')

await teste('estoque digital (códigos, credenciais)', async () => {
  const { data, error } = await supabase.from('digital_stock_items').select('content')
  const vazou = !error && data && data.length > 0
  return {
    ok: !vazou,
    detalhe: vazou ? `VAZOU ${data.length} códigos!` : 'bloqueado',
  }
})

await teste('cupons (varredura de códigos)', async () => {
  const { data, error } = await supabase.from('coupons').select('code')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} cupons!` : 'bloqueado' }
})

await teste('pedidos de terceiros', async () => {
  const { data, error } = await supabase.from('orders').select('customer_email, total_cents')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} pedidos!` : 'bloqueado' }
})

await teste('logs administrativos', async () => {
  const { data, error } = await supabase.from('admin_logs').select('action')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} logs!` : 'bloqueado' }
})

await teste('configurações privadas (gateway, segredos)', async () => {
  const { data, error } = await supabase.from('settings').select('key, value')
  if (error) return { ok: true, detalhe: 'bloqueado' }
  const privadas = ['payment_provider', 'order_expiration_minutes']
  const vazadas = (data ?? []).filter((s) => privadas.includes(s.key))
  return {
    ok: vazadas.length === 0,
    detalhe:
      vazadas.length > 0
        ? `VAZOU: ${vazadas.map((s) => s.key).join(', ')}`
        : `só as ${data.length} públicas`,
  }
})

await teste('entregas digitais', async () => {
  const { data, error } = await supabase.from('digital_deliveries').select('manual_content')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} entregas!` : 'bloqueado' }
})

await teste('perfis de clientes (e-mails)', async () => {
  const { data, error } = await supabase.from('profiles').select('email')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} e-mails!` : 'bloqueado' }
})

await teste('produtos em rascunho', async () => {
  const { data, error } = await supabase.from('products').select('name').eq('status', 'draft')
  const vazou = !error && data && data.length > 0
  return { ok: !vazou, detalhe: vazou ? `VAZOU ${data.length} rascunhos!` : 'bloqueado' }
})

console.log('\nEscrita que NÃO pode ser permitida:')

await teste('criar produto', async () => {
  const { error } = await supabase
    .from('products')
    .insert({ name: 'INVASAO', slug: `invasao-${Date.now()}`, price_cents: 1 })
  return { ok: !!error, detalhe: error ? 'bloqueado' : 'INSERIU UM PRODUTO!' }
})

// ATENÇÃO: um UPDATE barrado por RLS não devolve erro — ele simplesmente afeta
// zero linhas e retorna sucesso. Testar `if (error)` daria falso positivo aqui.
// A única prova é reler o valor e comparar.
await teste('alterar preço de produto', async () => {
  const { data } = await supabase.from('products').select('id, price_cents').limit(1)
  if (!data?.length) return { ok: true, detalhe: 'sem produto para testar' }

  const { id, price_cents: antes } = data[0]
  await supabase.from('products').update({ price_cents: 1 }).eq('id', id)

  const { data: depois } = await supabase
    .from('products')
    .select('price_cents')
    .eq('id', id)
    .single()

  const mudou = depois?.price_cents !== antes
  return {
    ok: !mudou,
    detalhe: mudou
      ? `ALTEROU o preço de ${antes} para ${depois?.price_cents}!`
      : `preço segue ${antes}`,
  }
})

// Mesmo raciocínio: confirmar que o DELETE não removeu nada de fato.
await teste('excluir produto', async () => {
  const { count: antes } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })

  const { data } = await supabase.from('products').select('id').limit(1)
  if (data?.length) await supabase.from('products').delete().eq('id', data[0].id)

  const { count: depois } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })

  return {
    ok: antes === depois,
    detalhe: antes === depois ? `${antes} produtos intactos` : `EXCLUIU! ${antes} -> ${depois}`,
  }
})

// Uma review nasce sempre não aprovada e exige compra paga. Um anônimo não
// pode plantar avaliação nenhuma — muito menos já aprovada.
await teste('plantar avaliação aprovada', async () => {
  const { data } = await supabase.from('products').select('id').limit(1)
  if (!data?.length) return { ok: true, detalhe: 'sem produto para testar' }

  const { error } = await supabase.from('reviews').insert({
    product_id: data[0].id,
    customer_name: 'Fake',
    rating: 5,
    comment: 'INVASAO',
    is_approved: true,
  })

  const { data: plantada } = await supabase
    .from('reviews')
    .select('id')
    .eq('comment', 'INVASAO')

  const vazou = (plantada?.length ?? 0) > 0
  return { ok: !!error && !vazou, detalhe: vazou ? 'PLANTOU UMA AVALIAÇÃO!' : 'bloqueado' }
})

await teste('conceder papel de admin a si mesmo', async () => {
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: '00000000-0000-0000-0000-000000000000', role: 'super_admin' })
  return { ok: !!error, detalhe: error ? 'bloqueado' : 'VIROU ADMIN!' }
})

console.log('\nRPCs privilegiadas que NÃO podem ser chamadas:')

for (const [rpc, args] of [
  ['create_order', { p_items: [], p_customer_email: 'x@x.com' }],
  ['mark_order_paid', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ['cancel_order', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_my_delivery', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ['compute_coupon_discount', { p_code: 'X', p_subtotal_cents: 100 }],
]) {
  await teste(`rpc ${rpc}`, async () => {
    const { error } = await supabase.rpc(rpc, args)
    // 404/PGRST202 = função não exposta ao anônimo; 42501 = sem privilégio.
    return { ok: !!error, detalhe: error ? 'bloqueado' : 'EXECUTOU!' }
  })
}

console.log(`\n${passed} passaram, ${failed} falharam\n`)
process.exit(failed > 0 ? 1 : 0)
