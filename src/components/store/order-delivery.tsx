'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Clock3,
  Copy,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import { regeneratePixChargeAction } from '@/actions/payment'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatPrice } from '@/lib/utils'

/**
 * Peças client das telas de pedido: copiar código, bloco do Pix, cartões de
 * entrega e o revalidador de status.
 *
 * Nada aqui busca dado: quem lê o banco é o Server Component da página, com o
 * filtro de propriedade já reposto. Estes componentes só recebem o que já foi
 * liberado para aquele comprador.
 */

// -----------------------------------------------------------------------------
// Copiar
// -----------------------------------------------------------------------------

export interface CopyButtonProps {
  value: string
  /** Aparece no aria-label e no toast: "Chave Pix copiada". */
  label?: string
  className?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  full?: boolean
}

export function CopyButton({
  value,
  label = 'Código',
  className,
  variant = 'outline',
  size = 'sm',
  full = false,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handleCopy() {
    try {
      // clipboard só existe em contexto seguro (https ou localhost); em http
      // o navegador nem expõe a API, daí o fallback com textarea + execCommand.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const area = document.createElement('textarea')
        area.value = value
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }

      setCopied(true)
      toast.success(`${label} copiado.`)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      aria-label={`Copiar ${label.toLowerCase()}`}
      className={cn(full && 'w-full', className)}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  )
}

// -----------------------------------------------------------------------------
// Pagamento Pix
// -----------------------------------------------------------------------------

export interface PixPaymentProps {
  /** Imagem do QR: data URI (base64) ou URL. */
  qrCode: string | null
  /** Copia-e-cola. */
  qrCodeText: string | null
  amountCents: number
  expiresAt: string | null
  /** Necessários para gerar um código novo quando o atual expira. */
  orderId: string
  /** Prova de posse do convidado (o mesmo ?email= que abriu a página). */
  viewerEmail?: string | null
}

/** Pede um código Pix novo quando o anterior venceu. */
function RegenerarPixButton({
  orderId,
  viewerEmail,
}: {
  orderId: string
  viewerEmail?: string | null
}) {
  const router = useRouter()
  const [carregando, setCarregando] = React.useState(false)

  async function gerar() {
    setCarregando(true)
    try {
      const resultado = await regeneratePixChargeAction({
        order_id: orderId,
        email: viewerEmail ?? undefined,
      })

      if (resultado.ok) {
        toast.success('Código Pix novo gerado.')
        router.refresh()
      } else {
        toast.error(resultado.error)
      }
    } catch {
      toast.error('Não foi possível gerar o código agora. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Button type="button" onClick={gerar} disabled={carregando} className="w-full sm:w-auto">
      {carregando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {carregando ? 'Gerando…' : 'Gerar novo código'}
    </Button>
  )
}

/**
 * Relógio compartilhado, de módulo.
 *
 * `getSnapshot` precisa devolver um valor ESTÁVEL entre renders — retornar
 * `Date.now()` direto faria o React ver um valor novo a cada checagem e entrar
 * em loop. Por isso o instante fica cacheado aqui e só muda no tique.
 *
 * Um único intervalo atende todos os componentes que assinarem.
 */
let instanteAtual = 0
const inscritos = new Set<() => void>()
let timerId: ReturnType<typeof setInterval> | null = null

function assinarRelogio(onChange: () => void): () => void {
  inscritos.add(onChange)

  if (timerId === null) {
    instanteAtual = Date.now()
    timerId = setInterval(() => {
      instanteAtual = Date.now()
      inscritos.forEach((fn) => fn())
    }, 1000)
  }

  return () => {
    inscritos.delete(onChange)
    if (inscritos.size === 0 && timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }
}

/**
 * Conta o tempo restante do código Pix.
 *
 * O snapshot do servidor é `null` de propósito: o relógio anda entre o render
 * do servidor e a hidratação, e devolver um número em ambos daria HTML
 * diferente. Sem contagem no primeiro paint, sem mismatch.
 */
function useContagemRegressiva(expiresAt: string | null): {
  restante: string | null
  expirado: boolean
} {
  const agora = React.useSyncExternalStore(
    assinarRelogio,
    () => (instanteAtual === 0 ? Date.now() : instanteAtual),
    () => null
  )

  if (!expiresAt || agora === null) return { restante: null, expirado: false }

  const faltam = new Date(expiresAt).getTime() - agora
  if (faltam <= 0) return { restante: null, expirado: true }

  const minutos = Math.floor(faltam / 60000)
  const segundos = Math.floor((faltam % 60000) / 1000)

  return {
    restante: `${minutos}:${String(segundos).padStart(2, '0')}`,
    expirado: false,
  }
}

export function PixPayment({
  qrCode,
  qrCodeText,
  amountCents,
  expiresAt,
  orderId,
  viewerEmail,
}: PixPaymentProps) {
  const hasQr = typeof qrCode === 'string' && qrCode.trim() !== ''
  const hasText = typeof qrCodeText === 'string' && qrCodeText.trim() !== ''
  const { restante, expirado } = useContagemRegressiva(expiresAt)

  if (expirado) {
    return (
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="size-4 text-warning" aria-hidden />
            O código Pix expirou
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Este código valia por tempo limitado e não pode mais ser pago. Seus itens
            continuam reservados — gere um código novo para concluir a compra.
          </p>
          <RegenerarPixButton orderId={orderId} viewerEmail={viewerEmail} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="size-4 text-primary" aria-hidden />
          Pague com Pix
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Valor a pagar:{' '}
          <strong className="text-foreground">{formatPrice(amountCents)}</strong>
          {restante && (
            <>
              {' · '}
              <span>
                expira em{' '}
                <strong className="font-mono text-foreground tabular-nums">{restante}</strong>
              </span>
            </>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasQr || hasText ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {hasQr && (
              <div className="mx-auto shrink-0 rounded-lg border border-border bg-white p-3 sm:mx-0">
                {/* next/image não serve aqui: o QR costuma vir como data URI
                    base64 gerado pelo provedor, sem host para o loader. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode as string}
                  alt="QR code do Pix para pagamento deste pedido"
                  width={180}
                  height={180}
                  className="size-[180px] object-contain"
                />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              {hasText && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Pix copia e cola</p>
                  <p className="max-h-24 overflow-y-auto break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-muted-foreground">
                    {qrCodeText}
                  </p>
                  <CopyButton
                    value={qrCodeText as string}
                    label="Código Pix"
                    variant="default"
                    size="default"
                    full
                  />
                </div>
              )}

              {/* O código Pix não é uma chave solta: é um payload que já carrega
                  destinatário, valor e identificador do pedido. Dizer isso
                  explicitamente evita a dúvida mais comum na hora de pagar
                  ("preciso digitar o valor?") e a digitação errada que vem dela. */}
              <p className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 p-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-px size-4 shrink-0 text-success" aria-hidden />
                <span>
                  O valor de <strong className="text-foreground">{formatPrice(amountCents)}</strong>{' '}
                  já vem preenchido no app do banco. Você não precisa digitar nada.
                </span>
              </p>

              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>1. Abra o app do seu banco e escolha pagar com Pix.</li>
                <li>
                  2. {hasQr ? 'Escaneie o QR code ou cole o código' : 'Cole o código'} — os dados
                  aparecem sozinhos.
                </li>
                <li>3. Confirme. A liberação é automática assim que o pagamento cair.</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Estamos gerando o código Pix deste pedido. Esta página atualiza sozinha assim que ele
            estiver pronto — não feche a janela.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Entrega digital
// -----------------------------------------------------------------------------

const CONTENT_TYPE_LABEL: Record<string, string> = {
  code: 'Código',
  link: 'Link',
  file: 'Arquivo',
  credential: 'Credencial',
  text: 'Instruções',
}

export interface DeliveryItemView {
  order_item_id: string
  product_name: string
  quantity: number
  delivery_type: string
  contents: { type: string; content: string }[]
}

export function DeliveryList({ items }: { items: DeliveryItemView[] }) {
  const hasContent = items.some((item) => item.contents.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/10 p-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-warning">Guarde estas informações</p>
          <p className="text-sm text-muted-foreground">
            Copie e salve os dados abaixo em um lugar seguro. Não compartilhe com ninguém: quem tem
            o código consegue usar o produto.
          </p>
        </div>
      </div>

      {items.map((item) => (
        <Card key={item.order_item_id}>
          <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">{item.product_name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'}
              </p>
            </div>
            <Badge variant={item.contents.length > 0 ? 'success' : 'warning'}>
              {item.contents.length > 0 ? 'Entregue' : 'Em preparação'}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {item.contents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {item.delivery_type === 'manual'
                  ? 'Este item é entregue manualmente pela nossa equipe. Você recebe aqui e por e-mail assim que estiver pronto.'
                  : 'Estamos separando o seu código. Atualize a página em instantes.'}
              </p>
            ) : (
              item.contents.map((content, index) => (
                <div
                  key={`${item.order_item_id}-${index}`}
                  className="rounded-lg border border-border bg-muted/40 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <KeyRound className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {CONTENT_TYPE_LABEL[content.type] ?? 'Conteúdo'}
                      {item.contents.length > 1 && ` ${index + 1}`}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground">
                      {content.content}
                    </p>
                    <CopyButton
                      value={content.content}
                      label={CONTENT_TYPE_LABEL[content.type] ?? 'Conteúdo'}
                      size="default"
                      className="shrink-0"
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}

      {!hasContent && (
        <p className="text-sm text-muted-foreground">
          Assim que a entrega for concluída, o conteúdo aparece nesta página.
        </p>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Revalidação do status
// -----------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000
const POLL_MAX_MS = 15 * 60 * 1000

/**
 * Enquanto o pagamento está pendente, chama router.refresh() a cada 5s para o
 * Server Component reler o pedido. Para sozinho depois de 15 minutos — deixar
 * uma aba aberta a noite inteira batendo no servidor não ajuda ninguém, e a
 * partir daí o cliente recarrega a página quando quiser.
 */
export function OrderStatusPoller({ active = true }: { active?: boolean }) {
  const router = useRouter()
  const [expired, setExpired] = React.useState(false)

  React.useEffect(() => {
    if (!active) return

    const deadline = Date.now() + POLL_MAX_MS
    let stopped = false

    const timer = setInterval(() => {
      if (stopped) return

      if (Date.now() >= deadline) {
        stopped = true
        clearInterval(timer)
        setExpired(true)
        return
      }

      // Aba em segundo plano não precisa de refresh: o efeito volta a valer
      // quando o cliente reabre, e o ciclo seguinte pega o status novo.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      router.refresh()
    }, POLL_INTERVAL_MS)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [active, router])

  if (!active) return null

  if (expired) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Paramos de verificar automaticamente.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          Verificar agora
        </Button>
      </div>
    )
  }

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      Verificando o pagamento automaticamente...
    </p>
  )
}
