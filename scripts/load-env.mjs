import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Lê o .env.local para os scripts de linha de comando.
 *
 * CUIDADO COM CRLF: no Windows o arquivo costuma terminar as linhas com \r\n.
 * Em JavaScript o `.` de uma regex NÃO casa `\r`, então um padrão como
 * /^(\w+)=(.*)$/ falha em TODAS as linhas — o resultado é um objeto vazio e um
 * erro adiante que não tem nada a ver com a causa ("supabaseUrl is required").
 * Por isso o \r é removido antes de qualquer coisa.
 */
export function loadEnv(caminhoRelativo = '.env.local') {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const caminho = join(root, caminhoRelativo)

  if (!existsSync(caminho)) {
    console.error(`${caminhoRelativo} não encontrado em ${root}`)
    process.exit(1)
  }

  const env = {}

  for (const bruta of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha || linha.startsWith('#')) continue

    const igual = linha.indexOf('=')
    if (igual <= 0) continue

    const chave = linha.slice(0, igual).trim()
    let valor = linha.slice(igual + 1).trim()

    // Aceita valores entre aspas, como qualquer leitor de .env faz.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }

    env[chave] = valor
  }

  return env
}

/** Falha cedo e com mensagem útil quando falta configuração. */
export function exigir(env, chaves) {
  const faltando = chaves.filter(
    (c) => !env[c] || env[c].startsWith('COLE_AQUI') || env[c].startsWith('sua_')
  )

  if (faltando.length > 0) {
    console.error(`\nFalta configurar no .env.local: ${faltando.join(', ')}\n`)
    process.exit(1)
  }

  return env
}
