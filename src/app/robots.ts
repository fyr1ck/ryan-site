import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

/**
 * Vitrine inteira liberada; área logada e API fora do índice.
 *
 * Isso é higiene de SEO, não segurança: /admin e /conta continuam protegidos
 * por RLS e por requireAdmin(). robots.txt só evita que o Google gaste
 * rastreamento em página que ele nunca vai conseguir abrir.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/conta', '/checkout', '/api'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
