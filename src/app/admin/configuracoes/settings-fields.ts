/**
 * Metadados da tela de configurações.
 *
 * Módulo sem diretiva de propósito: a página (Server Component) usa isto para
 * MASCARAR os segredos antes de mandar qualquer coisa para o browser, e o
 * formulário (Client Component) usa para desenhar o campo. Se este arquivo
 * fosse 'use client', o servidor não poderia chamar isSecretKey() e a máscara
 * teria de ser reescrita em dois lugares.
 */

export type SettingKind = 'string' | 'number' | 'boolean' | 'other'

export interface SettingField {
  key: string
  group_name: string
  label: string | null
  is_public: boolean
  kind: SettingKind
  /**
   * O valor atual — SEMPRE null quando is_secret. Credencial não trafega para
   * a tela nem dentro de um input type="password": o HTML chega ao browser em
   * texto puro e qualquer extensão o lê.
   */
  value: string | number | boolean | null
  is_secret: boolean
  /** Para o campo de segredo dizer "já configurado" sem revelar nada. */
  has_value: boolean
}

/** Chave que guarda credencial. Mesmo teste usado em src/actions/settings.ts. */
export function isSecretKey(key: string): boolean {
  return /(_key|_secret|_token)$/.test(key)
}

export const GROUP_ORDER = [
  'general',
  'brand',
  'contact',
  'social',
  'seo',
  'checkout',
  'features',
  'payment',
] as const

export const GROUP_LABEL: Record<string, string> = {
  general: 'Geral',
  brand: 'Marca',
  contact: 'Contato',
  social: 'Redes',
  seo: 'SEO',
  checkout: 'Checkout',
  features: 'Recursos',
  payment: 'Pagamento',
}

export const GROUP_DESCRIPTION: Record<string, string> = {
  general: 'Nome, slogan e descrição que aparecem na loja inteira.',
  brand: 'Logo, favicon e a cor que tinge os botões e destaques.',
  contact: 'Como o cliente fala com você.',
  social: 'Links das redes. Em branco, o ícone some do rodapé.',
  seo: 'Textos e imagem padrão para buscadores e prévias de link.',
  checkout: 'Ajustes da finalização da compra.',
  features: 'Liga e desliga blocos da vitrine.',
  payment: 'Pagamento e regras internas do pedido.',
}

/** Chaves que são imagem: viram ImageUpload no bucket store-assets. */
export const IMAGE_KEYS: Record<string, 'video' | 'square'> = {
  logo_url: 'video',
  favicon_url: 'square',
  seo_og_image: 'video',
}

/** Chaves de texto longo: Textarea em vez de Input. */
export const LONG_TEXT_KEYS = new Set(['store_description', 'seo_description'])

/** Rótulo de reserva quando a linha do banco não tem `label`. */
export function fallbackLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

/**
 * Ordem de leitura dentro de cada aba. `settings` não tem coluna de posição, e
 * ordenar por chave colocaria "Descrição" antes de "Nome da loja".
 */
const KEY_ORDER = [
  'store_name',
  'store_tagline',
  'store_description',
  'logo_url',
  'favicon_url',
  'primary_color',
  'contact_email',
  'whatsapp_url',
  'instagram_url',
  'discord_url',
  'youtube_url',
  'tiktok_url',
  'seo_title',
  'seo_description',
  'seo_og_image',
  'checkout_terms_url',
  'show_social_proof',
  'show_reviews_home',
  'payment_pix_enabled',
  'payment_provider',
  'order_expiration_minutes',
]

export function keyRank(key: string): number {
  const index = KEY_ORDER.indexOf(key)
  return index === -1 ? KEY_ORDER.length : index
}

// ---------------------------------------------------------------------------
// Cor primária: o CSS guarda "258 90% 62%" (canais soltos, sem hsl()), mas o
// <input type="color"> só fala hexadecimal. As duas conversões vivem aqui.
// ---------------------------------------------------------------------------

const HSL_PATTERN = /^(\d{1,3})\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/

export function hexToHsl(hex: string): string | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return null

  const int = Number.parseInt(match[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min

  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4

    hue *= 60
    if (hue < 0) hue += 360
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
}

export function hslToHex(value: string): string {
  const match = HSL_PATTERN.exec(value.trim())
  if (!match) return '#000000'

  const hue = Number(match[1]) % 360
  const saturation = Math.min(Number(match[2]), 100) / 100
  const lightness = Math.min(Number(match[3]), 100) / 100

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const offset = lightness - chroma / 2

  let rgb: [number, number, number]
  if (hue < 60) rgb = [chroma, second, 0]
  else if (hue < 120) rgb = [second, chroma, 0]
  else if (hue < 180) rgb = [0, chroma, second]
  else if (hue < 240) rgb = [0, second, chroma]
  else if (hue < 300) rgb = [second, 0, chroma]
  else rgb = [chroma, 0, second]

  const toHex = (channel: number) =>
    Math.round((channel + offset) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

export function isValidHsl(value: string): boolean {
  return HSL_PATTERN.test(value.trim())
}
