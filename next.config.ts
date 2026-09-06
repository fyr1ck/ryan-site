import type { NextConfig } from 'next'

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    // Imagens vêm do Supabase Storage (buckets públicos) e de /public.
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
    formats: ['image/avif', 'image/webp'],
    // Os cards do grid são pequenos; evita gerar tamanhos que ninguém usa.
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },

  // Cabeçalhos de segurança ficam no middleware (precisam do nonce/CSP dinâmico).
  poweredByHeader: false,

  experimental: {
    // Server Actions só aceitam requisições da própria origem.
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
