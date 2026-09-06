/**
 * Máscara de conteúdo sensível (chaves, credenciais, links de entrega).
 *
 * Regra da casa: a LISTAGEM nunca recebe o conteúdo real. O servidor manda só o
 * que sai daqui, e o botão "Revelar" busca o valor de verdade numa Server
 * Action que registra a visualização em admin_logs. Se a máscara fosse feita no
 * navegador, o segredo já estaria no HTML e o olhinho seria enfeite.
 *
 * O formato preserva os separadores para a chave continuar reconhecível de
 * relance: "DEMO-1234-3" vira "DEMO-••••-3".
 */
export function maskSecret(value: string | null | undefined): string {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  if (clean === '') return '—'

  // Segredo curto demais não tem o que preservar: mascara inteiro.
  if (clean.length <= 5) return '•'.repeat(clean.length)

  const chars = Array.from(clean)

  // Credencial longa (JSON, token, bloco de texto) viraria uma parede de
  // bolinhas quebrando o layout da tabela. Corta e resume.
  if (chars.length > 24) {
    return `${chars.slice(0, 4).join('')}${'•'.repeat(8)}…${chars[chars.length - 1]}`
  }

  const last = chars.length - 1
  return chars
    .map((char, index) => {
      if (index < 4 || index === last) return char
      return /[\p{L}\p{N}]/u.test(char) ? '•' : char
    })
    .join('')
}
