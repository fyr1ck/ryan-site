'use client'

import * as React from 'react'
import Link from 'next/link'
import { Home, RotateCcw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Erro inesperado em qualquer rota abaixo da raiz.
 *
 * A mensagem do Error é omitida de propósito: em produção ela vem redigida
 * pelo Next, e em desenvolvimento costuma carregar caminho de arquivo e
 * detalhe de consulta — nada disso ajuda o cliente e tudo isso ajuda quem
 * está sondando a loja. O que fica na tela é o `digest`, o identificador que
 * o suporte usa para achar o erro no log do servidor.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="container-store flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center sm:py-24">
      <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" aria-hidden />
      </span>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">Algo deu errado por aqui</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
          A falha foi do nosso lado, não do seu. Tente de novo — se continuar, é só falar com o
          suporte.
        </p>
        {error.digest && (
          <p className="pt-1 text-xs text-muted-foreground">
            Código do erro: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={reset}>
          <RotateCcw aria-hidden />
          Tentar de novo
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
