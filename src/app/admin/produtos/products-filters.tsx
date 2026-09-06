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

const ALL = 'todos'

const STATUS_FILTERS = [
  { value: ALL, label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'archived', label: 'Arquivados' },
]

export interface ProductsFiltersProps {
  /** Valores atuais, lidos do searchParams pela página (Server Component). */
  status: string
  search: string
}

/**
 * Filtros da listagem.
 *
 * O estado mora na URL, não aqui: assim o admin pode favoritar "só rascunhos",
 * o botão voltar funciona e a paginação continua fazendo sentido depois de um
 * refresh. A busca só dispara no submit — filtrar a cada tecla dispararia uma
 * consulta por letra digitada.
 */
export function ProductsFilters({ status, search }: ProductsFiltersProps) {
  const router = useRouter()
  const [term, setTerm] = React.useState(search)
  const [syncedSearch, setSyncedSearch] = React.useState(search)

  // A URL manda: quando ela muda (voltar do navegador, "Limpar"), o campo
  // acompanha. Ajustar durante o render é mais barato que um efeito — evita
  // pintar uma vez com o valor velho antes de corrigir.
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    setTerm(search)
  }

  function navigate(next: { status?: string; q?: string }) {
    const params = new URLSearchParams()
    const nextStatus = next.status ?? status
    const nextTerm = next.q ?? term

    if (nextStatus && nextStatus !== ALL) params.set('status', nextStatus)
    if (nextTerm.trim()) params.set('q', nextTerm.trim())

    const query = params.toString()
    router.push(query ? `/admin/produtos?${query}` : '/admin/produtos')
  }

  const hasFilters = (status && status !== ALL) || search.trim().length > 0

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          navigate({ q: term })
        }}
        className="relative flex-1"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por nome…"
          aria-label="Buscar produtos por nome"
          className="pl-9"
        />
        <button type="submit" className="sr-only">
          Buscar
        </button>
      </form>

      <Select value={status || ALL} onValueChange={(value) => navigate({ status: value })}>
        <SelectTrigger className="sm:w-52" aria-label="Filtrar por status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTerm('')
            router.push('/admin/produtos')
          }}
        >
          <X />
          Limpar
        </Button>
      )}
    </div>
  )
}
