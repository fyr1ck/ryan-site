'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface SearchFormProps {
  /** Rota da listagem, ex.: '/admin/clientes'. */
  basePath: string
  /** Termo atual, lido da URL no servidor. */
  q?: string
  placeholder?: string
  label?: string
}

/**
 * Campo de busca genérico das listagens do painel.
 *
 * Buscar reinicia a paginação de propósito: o parâmetro `pagina` não é
 * repassado. Ficar na página 4 de um resultado novo mostraria uma lista vazia
 * e pareceria "não encontrei nada".
 *
 * Quem chama passa `key={q}`: assim o campo volta a acompanhar a URL quando o
 * admin usa o botão "voltar" do navegador, sem um efeito de sincronização.
 */
export function SearchForm({ basePath, q, placeholder = 'Buscar…', label = 'Buscar' }: SearchFormProps) {
  const router = useRouter()
  const [term, setTerm] = React.useState(q ?? '')

  function submit(value: string) {
    const trimmed = value.trim()
    router.push(trimmed === '' ? basePath : `${basePath}?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      className="mb-4 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit(term)
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="pl-9"
        />
      </div>

      <Button type="submit" variant="secondary">
        {label}
      </Button>

      {(q ?? '') !== '' && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTerm('')
            router.push(basePath)
          }}
        >
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </form>
  )
}
