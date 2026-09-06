import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, Home, SearchX } from 'lucide-react'

import { SearchBar } from '@/components/store/search-bar'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false, follow: false },
}

/**
 * 404 da loja.
 *
 * Fica na raiz, fora do grupo (store), então não herda o cabeçalho: por isso
 * traz a própria busca e os próprios atalhos. Quem chegou aqui por link
 * quebrado sai daqui para o catálogo, não para uma tela sem saída.
 */
export default function NotFound() {
  return (
    <div className="container-store flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center sm:py-24">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" aria-hidden />
      </span>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Erro 404</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Não encontramos esta página</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
          O endereço pode ter mudado, ou o produto saiu do ar. Tente buscar pelo que você
          procurava.
        </p>
      </div>

      <SearchBar className="w-full max-w-md" placeholder="Buscar produtos…" />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/produtos">
            <Compass aria-hidden />
            Ver todos os produtos
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">
            <Home aria-hidden />
            Voltar para a home
          </Link>
        </Button>
      </div>
    </div>
  )
}
