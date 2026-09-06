'use client'

import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ALL = 'todos'

export const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'tudo', label: 'Desde o começo' },
] as const

export interface LogFiltersProps {
  admins: string[]
  entities: { value: string; label: string }[]
  admin?: string
  entity?: string
  period: string
}

export function LogFilters({ admins, entities, admin, entity, period }: LogFiltersProps) {
  const router = useRouter()

  function navigate(next: { admin?: string; entidade?: string; periodo?: string }) {
    const params = new URLSearchParams()
    const nextAdmin = next.admin ?? admin ?? ALL
    const nextEntity = next.entidade ?? entity ?? ALL
    const nextPeriod = next.periodo ?? period

    if (nextAdmin !== ALL) params.set('admin', nextAdmin)
    if (nextEntity !== ALL) params.set('entidade', nextEntity)
    if (nextPeriod !== '30') params.set('periodo', nextPeriod)

    const query = params.toString()
    router.push(query ? `/admin/logs?${query}` : '/admin/logs')
  }

  const hasFilters = (admin ?? ALL) !== ALL || (entity ?? ALL) !== ALL || period !== '30'

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="filter-admin">Administrador</Label>
        <Select value={admin ?? ALL} onValueChange={(value) => navigate({ admin: value })}>
          <SelectTrigger id="filter-admin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {admins.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-entity">Entidade</Label>
        <Select value={entity ?? ALL} onValueChange={(value) => navigate({ entidade: value })}>
          <SelectTrigger id="filter-entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {entities.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-period">Período</Label>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(value) => navigate({ periodo: value })}>
            <SelectTrigger id="filter-period" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button type="button" variant="ghost" onClick={() => router.push('/admin/logs')}>
              <X className="size-4" />
              Limpar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
