/**
 * Regra do nick do Roblox, compartilhada entre o formulário de checkout
 * (Client Component) e a Server Action que valida antes de chamar a RPC.
 *
 * Módulo neutro de propósito — sem 'use client' e sem 'server-only'. A mesma
 * regra precisa valer nos dois lados: no cliente para avisar antes do envio, no
 * servidor porque o formulário é conveniência, não barreira.
 *
 * A regra final, porém, é a de `create_order` (migration 0016). Se as três
 * divergirem, quem manda é o banco — é o único caminho até a tabela orders.
 */

/**
 * 3 a 20 caracteres, letras/números/underscore, underscore nunca nas pontas.
 * É o formato que o Roblox aceita; barrar aqui evita descobrir que o campo
 * recebeu um e-mail só na hora de entregar o item.
 */
export const ROBLOX_USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$/

export const ROBLOX_USERNAME_HINT =
  'De 3 a 20 caracteres: letras, números e _ (o _ não pode ficar no começo nem no fim).'

export const ROBLOX_USERNAME_ERROR = `Usuário do Roblox inválido. ${ROBLOX_USERNAME_HINT}`

export function isValidRobloxUsername(value: string): boolean {
  return ROBLOX_USERNAME_PATTERN.test(value.trim())
}
