'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/database.types'

// =============================================================================
// Configurações da loja.
//
// Três regras que valem a pena não perder de vista:
//
// 1. Só dá para EDITAR chave que já existe. A tela nunca cria linha nova em
//    `settings` — chave desconhecida é erro, não insert. Assim ninguém planta
//    uma chave falsa que um código futuro venha a ler.
//
// 2. O tipo do valor tem de bater com o que já está gravado. `settings.value` é
//    jsonb livre: gravar "true" (string) onde o site espera boolean quebraria a
//    leitura em silêncio, num lugar onde ninguém olha.
//
// 3. VALOR DE SEGREDO NUNCA VAI PARA O LOG. O admin_logs é lido por quem tem
//    logs.read — um público bem maior que quem tem settings.write. O log
//    registra QUAIS chaves mudaram, jamais para quê.
// =============================================================================

export interface SettingsActionResult {
  ok: boolean
  error?: string
  /** Quantas chaves foram realmente gravadas. */
  updated?: number
}

/**
 * Chave que guarda credencial. Mantido em sincronia com o mesmo teste na tela
 * (src/app/admin/configuracoes/settings-fields.ts) — aqui a checagem existe
 * para o LOG e para o "campo em branco mantém o valor atual"; lá, para o input.
 */
function isSecretKey(key: string): boolean {
  return /(_key|_secret|_token)$/.test(key)
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,79}$/

/** HSL sem função, do jeito que o CSS var espera: "258 90% 62%". */
const HSL_PATTERN = /^\d{1,3} \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/

const settingValueSchema = z.union([
  z.string().max(5000, 'O valor é longo demais.'),
  z.number(),
  z.boolean(),
  z.null(),
])

const updateSettingsSchema = z.object({
  values: z
    .array(
      z.object({
        key: z.string().trim().regex(KEY_PATTERN, 'Chave de configuração inválida.'),
        value: settingValueSchema,
      })
    )
    .min(1, 'Nada para salvar.')
    .max(80, 'Muitas chaves de uma vez.')
    .refine(
      (values) => new Set(values.map((entry) => entry.key)).size === values.length,
      'A mesma chave veio duas vezes.'
    ),
})

export type SettingsInput = z.input<typeof updateSettingsSchema>

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  console.error('[settings]', error)
  return fallback
}

function jsonKind(value: Json): 'string' | 'number' | 'boolean' | 'other' {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'other'
}

const LINK_KEYS = new Set([
  'logo_url',
  'favicon_url',
  'seo_og_image',
  'checkout_terms_url',
  'whatsapp_url',
  'instagram_url',
  'discord_url',
  'youtube_url',
  'tiktok_url',
])

/** Regras extras por chave. Devolve a mensagem de erro ou null se estiver ok. */
function validateByKey(key: string, value: string | number | boolean | null): string | null {
  if (key === 'primary_color') {
    if (typeof value !== 'string' || !HSL_PATTERN.test(value)) {
      return 'A cor primária precisa estar no formato "258 90% 62%".'
    }
    return null
  }

  if (key === 'contact_email') {
    if (typeof value !== 'string') return 'O e-mail de contato precisa ser um texto.'
    if (value !== '' && !z.email().safeParse(value).success) {
      return 'Informe um e-mail de contato válido.'
    }
    return null
  }

  if (LINK_KEYS.has(key)) {
    if (typeof value !== 'string') return 'Este campo precisa ser um texto.'
    if (value === '') return null
    if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) {
      return `O campo "${key}" precisa começar com "/" ou com http(s)://`
    }
    return null
  }

  if (key === 'order_expiration_minutes') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 5 || value > 1440) {
      return 'O tempo de expiração precisa ser um número inteiro entre 5 e 1440 minutos.'
    }
    return null
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'Informe um número válido.'
  }

  return null
}

/**
 * Salva várias chaves de uma vez.
 *
 * Campo de segredo em branco significa "não mexa": é o que permite a tela
 * nunca receber o valor atual de uma credencial e mesmo assim salvar o resto
 * do formulário sem apagá-la.
 */
export async function updateSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const parsed = updateSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const incoming = parsed.data.values

  try {
    const user = await requirePermission('settings.write')
    const supabase = await createClient()

    const keys = incoming.map((entry) => entry.key)
    const { data: existingRows, error: readError } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', keys)

    if (readError) {
      console.error('[updateSettingsAction:read]', readError.message)
      return { ok: false, error: 'Não foi possível ler as configurações atuais.' }
    }

    const existing = new Map((existingRows ?? []).map((row) => [row.key as string, row.value as Json]))

    const toWrite: { key: string; value: Json }[] = []

    for (const entry of incoming) {
      const current = existing.get(entry.key)
      if (current === undefined) {
        return { ok: false, error: `A configuração "${entry.key}" não existe.` }
      }

      // Segredo em branco = manter o que já está lá.
      if (isSecretKey(entry.key) && (entry.value === '' || entry.value === null)) continue

      const currentKind = jsonKind(current)
      const nextKind = jsonKind(entry.value as Json)

      if (currentKind !== 'other' && nextKind !== currentKind) {
        return {
          ok: false,
          error: `A configuração "${entry.key}" espera um valor do tipo ${currentKind}.`,
        }
      }

      const problem = validateByKey(entry.key, entry.value)
      if (problem) return { ok: false, error: problem }

      toWrite.push({ key: entry.key, value: entry.value as Json })
    }

    if (toWrite.length === 0) return { ok: true, updated: 0 }

    const results = await Promise.all(
      toWrite.map((entry) =>
        supabase
          .from('settings')
          .update({ value: entry.value, updated_by: user.id })
          .eq('key', entry.key)
      )
    )

    const failed = results.find((result) => result.error)
    if (failed?.error) {
      console.error('[updateSettingsAction:write]', failed.error.message)
      return { ok: false, error: 'Não foi possível salvar as configurações.' }
    }

    // Só a LISTA de chaves. Ver a regra 3 no topo do arquivo.
    const changedKeys = toWrite.map((entry) => entry.key)
    const { error: logError } = await supabase.rpc('log_admin_action', {
      p_actor_id: user.id,
      p_action: 'settings.update',
      p_entity_type: 'setting',
      p_entity_id: changedKeys.join(','),
      p_summary: `${changedKeys.length} configuração(ões) alterada(s).`,
      p_metadata: { keys: changedKeys },
    })
    if (logError) console.error('[settings:log_admin_action]', logError.message)

    // Nome, logo, cor e redes aparecem no header e no rodapé de todas as telas.
    revalidatePath('/', 'layout')
    revalidatePath('/admin/configuracoes')

    return { ok: true, updated: toWrite.length }
  } catch (error) {
    return { ok: false, error: toMessage(error, 'Não foi possível salvar as configurações.') }
  }
}
