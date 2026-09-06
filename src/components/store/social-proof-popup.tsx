'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, X } from 'lucide-react'

import { cn, timeAgo } from '@/lib/utils'

const STORAGE_KEY = 'roblox-store-social-proof-dismissed'
const FALLBACK_IMAGE = '/placeholders/product-1.svg'
const SHOW_MS = 6000
const HIDE_MS = 4000

export interface SocialProofPurchase {
  id: string
  /** Nome completo — o componente encurta para "Fulano S." antes de exibir. */
  customerName: string
  productName: string
  productSlug: string
  productImageUrl?: string | null
  createdAt: string
}

export interface SocialProofPopupProps {
  purchases: SocialProofPurchase[]
  /** settings.show_social_proof — desligado no painel, nada é renderizado. */
  enabled?: boolean
  className?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * sessionStorage e matchMedia são estado de fora do React. Ler os dois com
 * useSyncExternalStore (em vez de setState dentro de um efeito) evita a
 * renderização em cascata e deixa o React usar o snapshot do servidor
 * durante a hidratação — sem divergência de HTML.
 */
function subscribeToNothing(): () => void {
  return () => {}
}

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Modo privado ou storage bloqueado: mostra normalmente.
    return false
  }
}

/** No servidor o popup não existe — ele é enfeite de cliente. */
function dismissedOnServer(): boolean {
  return true
}

function subscribeToMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function reducedMotionOnServer(): boolean {
  return false
}

/** "Pedro Henrique Silva" → "Pedro S.": prova social sem expor o cliente. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Alguém'
  const first = parts[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : null
  return last ? `${first} ${last[0].toUpperCase()}.` : first
}

/**
 * Aviso de compra recente no canto inferior esquerdo.
 *
 * Cicla: 6s visível, 4s escondido, próximo da lista. Quem fecha não vê de
 * novo na mesma aba (sessionStorage — o localStorage silenciaria o aviso
 * para sempre, o que não é a intenção).
 */
export function SocialProofPopup({
  purchases,
  enabled = true,
  className,
}: SocialProofPopupProps) {
  const [visible, setVisible] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  /** Fechou agora, nesta página. */
  const [closedNow, setClosedNow] = React.useState(false)

  const closedBefore = React.useSyncExternalStore(
    subscribeToNothing,
    readDismissed,
    dismissedOnServer
  )
  const reducedMotion = React.useSyncExternalStore(
    subscribeToMotion,
    readReducedMotion,
    reducedMotionOnServer
  )

  const dismissed = closedNow || closedBefore
  const total = purchases.length

  React.useEffect(() => {
    if (!enabled || dismissed || total === 0) return

    const timer = window.setTimeout(
      () => {
        if (visible) {
          setVisible(false)
          return
        }
        setIndex((current) => (current + 1) % total)
        setVisible(true)
      },
      visible ? SHOW_MS : HIDE_MS
    )

    return () => window.clearTimeout(timer)
  }, [enabled, dismissed, total, visible])

  if (!enabled || dismissed || total === 0) return null

  const purchase = purchases[index % total]
  const image = purchase.productImageUrl || FALLBACK_IMAGE

  function close() {
    setVisible(false)
    setClosedNow(true)
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Sem storage o aviso volta na próxima página. Não é motivo de erro.
    }
  }

  return (
    <div
      className={cn(
        'fixed bottom-3 left-3 z-40 w-[17rem] max-w-[calc(100vw-1.5rem)] sm:bottom-4 sm:left-4',
        'rounded-xl border border-border bg-card/95 p-2.5 shadow-xl backdrop-blur-sm',
        reducedMotion ? 'transition-none' : 'transition-all duration-300 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        className
      )}
      // Aviso promocional: não interrompe quem usa leitor de tela.
      aria-hidden={!visible}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Não mostrar mais avisos de compra"
        className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden />
      </button>

      <Link
        href={`/produto/${purchase.productSlug}`}
        className="flex items-center gap-2.5 pr-5"
        tabIndex={visible ? undefined : -1}
      >
        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image
            src={image}
            alt=""
            fill
            sizes="44px"
            unoptimized={image.endsWith('.svg')}
            className="object-cover"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs leading-snug text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {shortName(purchase.customerName)}
            </strong>{' '}
            comprou
          </span>
          <span className="block truncate text-xs font-medium leading-snug text-foreground">
            {purchase.productName}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <BadgeCheck className="size-3 text-success" aria-hidden />
            Compra verificada
            <span aria-hidden>·</span>
            <span suppressHydrationWarning>{timeAgo(purchase.createdAt)}</span>
          </span>
        </span>
      </Link>
    </div>
  )
}
