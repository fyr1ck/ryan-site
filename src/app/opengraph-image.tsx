import { ImageResponse } from 'next/og'
import { getStoreSettings } from '@/lib/queries/settings'

/**
 * Imagem OpenGraph gerada em PNG.
 *
 * O placeholder da loja é SVG, e SVG não funciona como og:image — nem o
 * Facebook, nem o WhatsApp, nem o X renderizam. Gerar aqui resolve isso e ainda
 * mantém a imagem em sincronia com o nome e a cor definidos no painel.
 */
export const runtime = 'nodejs'
export const alt = 'Roblox Store'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  const settings = await getStoreSettings().catch(() => null)

  const storeName = settings?.store_name ?? 'Roblox Store'
  const tagline = settings?.store_tagline ?? 'Produtos digitais com entrega imediata'

  // A cor do painel vem como "H S% L%" (formato que o CSS espera).
  // O satori não resolve hsl(var(--x)), então montamos a string completa.
  const primary = settings?.primary_color?.trim() || '258 90% 62%'
  const accent = `hsl(${primary})`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#09090b',
          position: 'relative',
        }}
      >
        {/* Brilho da cor da marca no canto */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 700,
            height: 700,
            borderRadius: '50%',
            background: accent,
            opacity: 0.22,
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: accent,
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 30, color: '#a1a1aa', letterSpacing: 2, display: 'flex' }}>
            LOJA DIGITAL
          </div>
        </div>

        <div
          style={{
            fontSize: 82,
            fontWeight: 700,
            color: '#fafafa',
            lineHeight: 1.05,
            letterSpacing: -2,
            display: 'flex',
            maxWidth: 900,
          }}
        >
          {storeName}
        </div>

        <div
          style={{
            fontSize: 34,
            color: '#a1a1aa',
            marginTop: 28,
            maxWidth: 850,
            lineHeight: 1.3,
            display: 'flex',
          }}
        >
          {tagline}
        </div>

        <div
          style={{
            marginTop: 56,
            display: 'flex',
            gap: 16,
          }}
        >
          {['Entrega imediata', 'Pagamento via Pix', 'Suporte humano'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '12px 24px',
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,0.12)',
                color: '#d4d4d8',
                fontSize: 24,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  )
}
