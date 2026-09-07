/**
 * Validação de CPF, compartilhada entre o formulário de checkout (Client
 * Component) e a Server Action que valida antes de criar a cobrança.
 *
 * Módulo neutro de propósito — sem 'use client' e sem 'server-only'.
 *
 * POR QUE O CPF EXISTE AQUI: o gateway (MisticPay) exige `payerDocument` na
 * criação da cobrança Pix. Não é escolha de produto — sem ele a API recusa e
 * nenhuma venda fecha.
 *
 * Validar o dígito verificador, e não só o tamanho, evita descobrir o erro de
 * digitação no pior momento possível: com o pedido criado, o estoque reservado
 * e o gateway devolvendo erro.
 */

/** Só os dígitos. O usuário digita "123.456.789-09"; a API quer "12345678909". */
export function stripCpf(value: string): string {
  return value.replace(/\D/g, '')
}

/** Formata para exibição enquanto a pessoa digita: 123.456.789-09 */
export function formatCpf(value: string): string {
  const d = stripCpf(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * Confere os dois dígitos verificadores.
 *
 * O algoritmo é o oficial da Receita: cada dígito é a soma ponderada dos
 * anteriores, módulo 11, com resto < 2 virando zero.
 */
export function isValidCpf(value: string): boolean {
  const cpf = stripCpf(value)

  if (cpf.length !== 11) return false

  // 00000000000, 11111111111... passam na conta dos dígitos mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  for (const [ate, posicao] of [
    [9, 9],
    [10, 10],
  ] as const) {
    let soma = 0
    for (let i = 0; i < ate; i += 1) {
      soma += Number(cpf[i]) * (posicao + 1 - i)
    }
    const resto = (soma * 10) % 11
    const digito = resto === 10 || resto === 11 ? 0 : resto
    if (digito !== Number(cpf[posicao])) return false
  }

  return true
}

export const CPF_ERROR = 'CPF inválido. Confira os números digitados.'
