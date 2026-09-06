import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'

import { CartProvider } from '@/components/cart/cart-provider'
import { Toaster } from '@/components/ui/toaster'
import { getStoreSettings } from '@/lib/queries/settings'
import { buildMetadata } from '@/lib/seo'

import './globals.css'
import { missingPublicEnv } from '@/lib/env'
import { SetupRequired } from '@/components/setup-required'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

/**
 * A loja é dark-first: avisar o navegador evita scrollbar e campos nativos
 * pintados de claro por cima do fundo escuro.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
}

/* -----------------------------------------------------------------------------
 * Cor primária vinda do painel.
 *
 * O valor sai do banco (settings.primary_color) e entra numa folha de estilo.
 * Isso é injeção de CSS por definição, então nada é interpolado sem passar
 * pela validação abaixo: ou os três canais HSL que o globals.css espera
 * ("258 90% 62%"), ou um hex que convertemos para esses canais. Qualquer
 * outra coisa é descartada e a loja fica com a cor padrão do tema.
 * -------------------------------------------------------------------------- */

const HSL_CHANNELS = /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/
const HEX_COLOR = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** "#7c3aed" → "258 90% 62%" (os canais que hsl() do tema consome). */
function hexToChannels(hex: string): string | null {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean

  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return null

  const r = ((value >> 16) & 255) / 255
  const g = ((value >> 8) & 255) / 255
  const b = (value & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min

  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
}

/** Devolve os canais HSL válidos, ou null para manter o padrão do tema. */
function primaryChannels(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (HSL_CHANNELS.test(raw)) return raw
  if (HEX_COLOR.test(raw)) return hexToChannels(raw)
  return null
}

export async function generateMetadata(): Promise<Metadata> {
  // Sem as variaveis nao ha banco para consultar; devolver algo estatico
  // evita que o proprio metadata derrube a pagina de diagnostico.
  if (missingPublicEnv().length > 0) {
    return { title: 'Configuracao pendente', robots: { index: false, follow: false } }
  }

  const settings = await getStoreSettings()

  const title = settings.seo_title || settings.store_name
  const description =
    settings.seo_description || settings.store_description || settings.store_tagline

  const base = buildMetadata({
    title,
    description,
    image: settings.seo_og_image,
    path: '/',
    siteName: settings.store_name,
  })

  return {
    ...base,
    // As páginas internas viram "Blox Fruits · Roblox Store" sem repetir o
    // nome da loja em cada generateMetadata().
    title: { default: title, template: `%s · ${settings.store_name}` },
    applicationName: settings.store_name,
    ...(settings.favicon_url ? { icons: { icon: settings.favicon_url } } : {}),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Curto-circuito ANTES de tocar no Supabase: sem as variaveis o client
  // lanca ao ser criado, e o 500 resultante nao explica nada a quem publicou.
  const faltando = missingPublicEnv()
  if (faltando.length > 0) return <SetupRequired missing={faltando} />

  const settings = await getStoreSettings()
  const channels = primaryChannels(settings.primary_color)

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* href + precedence fazem o React 19 içar esta folha para o <head>.
            As variáveis do globals.css vivem dentro de @layer base, e regra
            sem camada sempre vence camada — então esta sobrescrita pega
            independentemente da ordem em que as folhas entram no documento. */}
        {channels && (
          <style
            href="store-primary-color"
            precedence="high"
          >{`:root{--primary:${channels};--ring:${channels}}`}</style>
        )}

        <CartProvider>
          {children}
          <Toaster />
        </CartProvider>
      </body>
    </html>
  )
}
