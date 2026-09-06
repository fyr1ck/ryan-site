'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** Menos que isso não vale uma busca — devolveria a loja inteira. */
const MIN_TERM_LENGTH = 2
const DEBOUNCE_MS = 300

function searchHref(term: string): string {
  return `/produtos?q=${encodeURIComponent(term)}`
}

export interface SearchBarProps {
  placeholder?: string
  autoFocus?: boolean
  /** Chamado depois de navegar — o overlay do mobile usa para se fechar. */
  onNavigate?: () => void
  className?: string
}

/**
 * Busca do header.
 *
 * O debounce de 300ms não dispara requisição: ele faz o prefetch da rota de
 * resultados enquanto o cliente ainda digita, para o Enter cair numa página
 * já em cache. A navegação só acontece no submit (Enter ou lupa), então
 * ninguém é jogado para /produtos no meio de uma palavra.
 */
export function SearchBar({
  placeholder = 'O que você procura?',
  autoFocus = false,
  onNavigate,
  className,
}: SearchBarProps) {
  const router = useRouter()
  const [term, setTerm] = React.useState('')

  React.useEffect(() => {
    const trimmed = term.trim()
    if (trimmed.length < MIN_TERM_LENGTH) return

    const timer = window.setTimeout(() => {
      router.prefetch(searchHref(trimmed))
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [term, router])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = term.trim()
    if (trimmed.length < MIN_TERM_LENGTH) return

    router.push(searchHref(trimmed))
    onNavigate?.()
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Buscar produtos"
        enterKeyHint="search"
        className="h-9 bg-muted/60 pl-9 pr-3 sm:h-10"
      />
      <button type="submit" className="sr-only">
        Buscar
      </button>
    </form>
  )
}

/**
 * Versão mobile: só a lupa no header. O teclado do celular precisa da tela
 * inteira, então o campo abre num painel por cima em vez de espremer o
 * cabeçalho.
 */
export function MobileSearch({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Buscar produtos">
          <Search />
        </Button>
      </SheetTrigger>
      <SheetContent side="top" className="gap-3 p-4">
        <SheetTitle className="pr-10 text-base">Buscar na loja</SheetTitle>
        <SheetDescription className="sr-only">
          Digite o nome do produto e pressione Enter para ver os resultados.
        </SheetDescription>
        <SearchBar autoFocus onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
