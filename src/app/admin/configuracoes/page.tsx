import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { can, getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/database.types'

import { SettingsForm } from './settings-form'
import { isSecretKey, keyRank, type SettingField, type SettingKind } from './settings-fields'

export const metadata = { title: 'Configurações' }

function kindOf(value: Json): SettingKind {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'other'
}

interface SettingRow {
  key: string
  value: Json
  group_name: string
  label: string | null
  is_public: boolean
}

export default async function AdminSettingsPage() {
  const user = await getSessionUser()
  if (!can(user, 'settings.read')) redirect('/admin?erro=sem-permissao')

  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value, group_name, label, is_public')
    .order('group_name', { ascending: true })

  const rows = (data ?? []) as SettingRow[]

  const fields: SettingField[] = rows
    .map((row) => {
      const secret = isSecretKey(row.key)
      return {
        key: row.key,
        group_name: row.group_name,
        label: row.label,
        is_public: row.is_public,
        kind: kindOf(row.value),
        // A máscara acontece AQUI, no servidor. O valor de uma credencial não
        // entra no HTML nem como atributo de input: o que sai daqui é null.
        value: secret ? null : (row.value as string | number | boolean | null),
        is_secret: secret,
        has_value: secret ? typeof row.value === 'string' && row.value.length > 0 : true,
      }
    })
    .sort((a, b) => keyRank(a.key) - keyRank(b.key) || a.key.localeCompare(b.key))

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Nome, marca, contatos e regras da loja. As mudanças valem para o site inteiro assim que você salvar."
      />

      {fields.length === 0 ? (
        <EmptyState
          title="Nenhuma configuração encontrada"
          description="A tabela settings está vazia ou o seu perfil não tem permissão de leitura nela."
        />
      ) : (
        <SettingsForm fields={fields} canWrite={can(user, 'settings.write')} />
      )}
    </>
  )
}
