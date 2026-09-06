'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { ORDER_STATUS_OPTIONS } from './order-status'

const ALL = 'todos'

export interface OrderFiltersProps {
  /** Valores atuais, vindos da URL lida no servidor. */
  status?: string
  q?: string
}

/**
 * Filtros da lista de pedidos.
 *
 * Os valores chegam por PROP em vez de useSearchParams: a página já leu a URL
 * no servidor, e ler de novo aqui só adicionaria uma fronteira de Suspense sem
 * ganho nenhum. Navegar continua sendo router.push — o estado mora na URL.
 *
 * A página passa `key` com o termo atual: o campo se realinha com a URL no
 * botão "voltar" por remontagem, em vez de por efeito de sincronização.
 */
export function OrderFilters({ status, q }: OrderFiltersProps) {
  const router = useRouter()
  const [term, setTerm] = React.useState(q ?? '')

  function navigate(next: { status?: string; q?: string }) {
    const params = new URLSearchParams()
    const nextStatus = next.status ?? status
    const nextQuery = next.q ?? ''

    if (nextStatus && nextStatus !== ALL) params.set('status', nextStatus)
    if (nextQuery.trim() !== '') params.set('q', nextQuery.trim())

    const query = params.toString()
    router.push(query ? `/admin/pedidos?${query}` : '/admin/pedidos')
  }

  const hasFilters = (status && status !== ALL) || (q ?? '') !== ''

  return (
    <form
      className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        navigate({ q: term })
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por e-mail, nome ou número do pedido"
          aria-label="Buscar pedidos"
          className="pl-9"
        />
      </div>

      <Select
        value={status && status !== '' ? status : ALL}
        onValueChange={(value) => navigate({ status: value, q: term })}
      >
        <SelectTrigger className="sm:w-52" aria-label="Filtrar por status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {ORDER_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
          Buscar
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTerm('')
              router.push('/admin/pedidos')
            }}
          >
            <X className="size-4" />
            Limpar
          </Button>
        )}
      </div>
    </form>
  )
}
