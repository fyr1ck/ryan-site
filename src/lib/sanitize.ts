import sanitize from 'sanitize-html'

/**
 * Sanitiza HTML vindo do painel antes de renderizar com dangerouslySetInnerHTML.
 *
 * O admin é confiável, mas não é imune: uma conta comprometida poderia plantar
 * <script> na descrição de um produto e atingir todo visitante. A allowlist
 * abaixo cobre formatação, e nada mais.
 *
 * POR QUE NÃO isomorphic-dompurify: ele carrega jsdom no servidor, e o jsdom
 * quebra no runtime serverless da Vercel — `require() of ES Module` numa
 * dependência interna (html-encoding-sniffer -> @exodus/bytes). O sintoma era
 * 500 em TODA página, porque este módulo entra na cadeia do layout raiz via
 * seo.ts. Localmente não aparecia: o Node resolve os módulos de outro jeito
 * fora do bundle. sanitize-html trabalha sobre htmlparser2, sem DOM nenhum.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
]

const OPCOES: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  // Bloqueia javascript:, data: e afins em href/src.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // Conteúdo de <script>/<style> some junto com a tag, em vez de virar texto
  // solto no meio da página.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
  // Link para fora sem rel=noopener dá à página de destino acesso a
  // window.opener — e com ele, poder de trocar a aba de origem por um phishing.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      const externo = /^https?:\/\//i.test(href)
      return {
        tagName,
        attribs: externo
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : attribs,
      }
    },
  },
  disallowedTagsMode: 'discard',
}

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return sanitize(dirty, OPCOES)
}

/** Texto puro, para meta description e prévias. Sem dependência de parser. */
export function stripHtml(html: string | null | undefined, maxLength = 160): string {
  if (!html) return ''
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}
