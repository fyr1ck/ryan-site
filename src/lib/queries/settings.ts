import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface StoreSettings {
  store_name: string
  store_tagline: string
  store_description: string
  logo_url: string
  favicon_url: string
  primary_color: string
  contact_email: string
  whatsapp_url: string
  instagram_url: string
  discord_url: string
  youtube_url: string
  tiktok_url: string
  seo_title: string
  seo_description: string
  seo_og_image: string
  checkout_terms_url: string
  show_social_proof: boolean
  show_reviews_home: boolean
  payment_pix_enabled: boolean
  auth_google_enabled: boolean
  auth_discord_enabled: boolean
}

const FALLBACK: StoreSettings = {
  store_name: 'Roblox Store',
  store_tagline: 'Produtos digitais de Roblox com entrega imediata',
  store_description: '',
  logo_url: '/placeholders/logo.svg',
  favicon_url: '/favicon.ico',
  primary_color: '258 90% 62%',
  contact_email: '',
  whatsapp_url: '',
  instagram_url: '',
  discord_url: '',
  youtube_url: '',
  tiktok_url: '',
  seo_title: 'Roblox Store',
  seo_description: '',
  seo_og_image: '',
  checkout_terms_url: '/pagina/termos',
  show_social_proof: true,
  show_reviews_home: true,
  payment_pix_enabled: true,
  // Nascem desligados: o botao so aparece depois que o provedor for
  // configurado no Supabase, senao o clique leva a um 400.
  auth_google_enabled: false,
  auth_discord_enabled: false,
}

/**
 * Configurações públicas da loja.
 *
 * Usa o client com chave anon de propósito: o RLS só devolve linhas com
 * is_public = true. Assim, mesmo que alguém marque uma chave sensível por
 * engano, ela não chega ao browser por este caminho.
 */
export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  let data: { key: string; value: unknown }[] | null = null

  try {
    const supabase = await createClient()
    const resultado = await supabase.from('settings').select('key, value').eq('is_public', true)
    if (resultado.error) {
      console.error('[getStoreSettings]', resultado.error.message)
      return FALLBACK
    }
    data = resultado.data
  } catch (error) {
    // O Next usa EXCEÇÕES como controle de fluxo: cookies() dentro de uma rota
    // que ele tenta gerar estaticamente lança DYNAMIC_SERVER_USAGE, e é assim
    // que ele descobre que a rota é dinâmica. redirect() e notFound() fazem o
    // mesmo. Engolir esses erros aqui faria a página ser tratada como estática
    // e servir dados de fallback para sempre — por isso eles seguem subindo.
    const digest = (error as { digest?: unknown })?.digest
    if (typeof digest === 'string') throw error

    // Daqui para baixo é falha de verdade: configuração ausente ou banco fora
    // do ar. A loja abre com os padrões em vez de estourar 500 em toda página.
    console.error('[getStoreSettings] falha ao conectar', error)
    return FALLBACK
  }

  if (!data) return FALLBACK

  const map = Object.fromEntries(data.map((row) => [row.key, row.value]))

  return {
    ...FALLBACK,
    ...Object.fromEntries(
      Object.keys(FALLBACK).map((key) => {
        const value = map[key]
        return [key, value === undefined || value === null || value === '' ? FALLBACK[key as keyof StoreSettings] : value]
      })
    ),
  } as StoreSettings
})
