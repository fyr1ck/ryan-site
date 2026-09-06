/**
 * Checagem das variáveis de ambiente públicas.
 *
 * Sem elas, o client do Supabase lança na hora de ser criado. Como o layout
 * raiz busca as configurações da loja, esse erro derruba TODA página com um
 * 500 genérico — que não diz a quem está publicando o que precisa fazer.
 *
 * Aqui a falta vira um diagnóstico legível. Nomes de variáveis não são
 * segredo: sem eles o site não sobe de qualquer maneira.
 */

export const PUBLIC_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/** Nomes das variáveis públicas ausentes ou ainda com placeholder. */
export function missingPublicEnv(): string[] {
  return PUBLIC_ENV_VARS.filter((nome) => {
    const valor = process.env[nome]
    if (!valor || valor.trim() === '') return true
    // Valor copiado do .env.example sem trocar
    return valor.startsWith('sua_') || valor.startsWith('SEU-') || valor.includes('SEU-PROJETO')
  })
}

export function isConfigured(): boolean {
  return missingPublicEnv().length === 0
}
