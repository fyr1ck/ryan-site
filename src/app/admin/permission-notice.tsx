import { ShieldAlert } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import type { AppPermission } from '@/lib/types/database.types'

export interface PermissionNoticeProps {
  permission: AppPermission
  /** O que a pessoa tentou abrir, em português: "os pedidos", "o estoque". */
  what: string
}

/**
 * Tela de "você não pode ver isto".
 *
 * Por que não um redirect: o layout do painel já garantiu que quem chegou aqui
 * é admin. O que falta é uma permissão granular — e mandar a pessoa de volta ao
 * dashboard sem explicação faz parecer bug. Dizer qual permissão falta é o que
 * transforma um beco sem saída num pedido claro ao super admin.
 *
 * Isto é MENSAGEM, não proteção: quem protege de verdade é o RLS no banco e o
 * requirePermission de cada Server Action.
 */
export function PermissionNotice({ permission, what }: PermissionNoticeProps) {
  return (
    <EmptyState
      icon={<ShieldAlert />}
      title={`Sem permissão para ver ${what}`}
      description={`Seu usuário não tem a permissão "${permission}". Peça a um super admin para liberar em Administração.`}
    />
  )
}
