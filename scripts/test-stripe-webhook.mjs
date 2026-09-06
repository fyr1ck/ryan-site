#!/usr/bin/env node
/**
 * Prova que o webhook da Stripe aceita o que deve e recusa o resto.
 *
 * Gera a assinatura com o próprio SDK da Stripe (mesmo algoritmo que a Stripe
 * usa em produção), então dá para exercitar o endpoint sem conta, sem internet
 * e sem expor o servidor.
 *
 * Um webhook que recusa TUDO passaria despercebido num teste que só verifica
 * rejeição — por isso o caso da assinatura válida é o mais importante aqui.
 *
 *   node scripts/test-stripe-webhook.mjs [url]
 *
 * Exige que STRIPE_WEBHOOK_SECRET no .env.local seja o mesmo que o servidor
 * carregou (reinicie o dev server depois de mudar o .env).
 */

import Stripe from 'stripe'
import { loadEnv, exigir } from './load-env.mjs'

const url = process.argv[2] ?? 'http://localhost:3000/api/webhooks/stripe'

const env = exigir(loadEnv(), ['STRIPE_WEBHOOK_SECRET'])
const secret = env.STRIPE_WEBHOOK_SECRET

function eventoPix({ orderId, amount = 6990, type = 'payment_intent.succeeded' }) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pi_${Math.random().toString(36).slice(2)}`,
        object: 'payment_intent',
        amount,
        amount_received: amount,
        currency: 'brl',
        status: 'succeeded',
        metadata: { order_id: orderId, order_number: '9999' },
      },
    },
  })
}

async function envia(nome, { payload, header, esperado }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(header ? { 'stripe-signature': header } : {}),
    },
    body: payload,
  })

  const corpo = await res.text()
  const ok = esperado.includes(res.status)
  console.log(
    `  ${ok ? 'PASSOU ' : 'FALHOU '} ${nome} -> ${res.status} ${corpo.slice(0, 90)}`
  )
  return ok
}

const ORDER_FAKE = '11111111-2222-3333-4444-555555555555'
let passou = 0
let total = 0

async function teste(nome, opcoes) {
  total++
  if (await envia(nome, opcoes)) passou++
}

console.log(`\nWebhook: ${url}\n`)
console.log('Deve RECUSAR:')

await teste('sem cabeçalho de assinatura', {
  payload: eventoPix({ orderId: ORDER_FAKE }),
  header: null,
  esperado: [400],
})

await teste('assinatura forjada', {
  payload: eventoPix({ orderId: ORDER_FAKE }),
  header: 't=1700000000,v1=deadbeef',
  esperado: [400],
})

{
  // Assinatura válida, mas para OUTRO corpo: é o ataque de troca de payload,
  // em que alguém captura um evento legítimo e altera o valor.
  const original = eventoPix({ orderId: ORDER_FAKE, amount: 100 })
  const header = Stripe.webhooks.generateTestHeaderString({ payload: original, secret })
  const adulterado = eventoPix({ orderId: ORDER_FAKE, amount: 999999 })
  await teste('corpo adulterado depois de assinado', {
    payload: adulterado,
    header,
    esperado: [400],
  })
}

{
  // Assinatura correta, porém com timestamp velho: replay de evento antigo.
  const payload = eventoPix({ orderId: ORDER_FAKE })
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000) - 60 * 60,
  })
  await teste('replay de evento com 1h', { payload, header, esperado: [400] })
}

{
  // Segredo diferente: simula um atacante que descobriu a URL mas não a chave.
  const payload = eventoPix({ orderId: ORDER_FAKE })
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_chave_errada_do_atacante',
  })
  await teste('assinado com o segredo errado', { payload, header, esperado: [400] })
}

console.log('\nDeve ACEITAR (passar da verificação de assinatura):')

{
  const payload = eventoPix({ orderId: ORDER_FAKE })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
  // 200 = processou; 500 = passou da assinatura e parou na service_role, que
  // é o esperado enquanto ela não estiver configurada. O que importa aqui é
  // NÃO ser 400 — 400 significaria que a verificação recusou algo legítimo.
  await teste('assinatura válida', { payload, header, esperado: [200, 500] })
}

{
  const payload = JSON.stringify({
    id: 'evt_ignorado',
    object: 'event',
    type: 'customer.created',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'cus_x' } },
  })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
  // Evento que a loja não usa: 200 para a Stripe parar de reenviar.
  await teste('evento não tratado devolve 200', { payload, header, esperado: [200] })
}

console.log(`\n${passou}/${total} cenários corretos\n`)
process.exit(passou === total ? 0 : 1)
