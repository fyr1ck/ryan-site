'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ChevronDown,
  CreditCard,
  Loader2,
  Lock,
  Package,
  QrCode,
  Receipt,
  ShoppingCart,
  Tag,
  Ticket,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

import { createOrderAction, validateCouponAction } from '@/actions/checkout'
import { useCart } from '@/components/cart/cart-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { cn, formatPrice } from '@/lib/utils'

/**
 * Formulário de checkout.
 *
 * Regras que valem aqui:
 *  - Nenhum valor de dinheiro sai daqui para o servidor. A action recebe
 *    product_id + quantidade e a RPC create_order relê preço, aplica cupom e
 *    reserva estoque. O total desta tela é PREVISÃO.
 *  - O desconto do cupom mostrado é o de compute_coupon_discount, que é a mesma
 *    conta feita no fechamento — mas quem manda é o fechamento.
 *  - O carrinho só é limpo depois que o pedido existe no banco.
 */

interface PaymentMethod {
  id: string
  label: string
  description: string
  /** Selos ao lado do nome ("Mais rápido", "Aprovação imediata"). */
  highlights: string[]
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
}

export interface CheckoutFormProps {
  isLoggedIn: boolean
  defaultEmail: string | null
  defaultName: string | null
  /** settings.checkout_terms_url */
  termsUrl: string
  /** settings.payment_pix_enabled */
  pixEnabled: boolean
}

export function CheckoutForm({
  isLoggedIn,
  defaultEmail,
  defaultName,
  termsUrl,
  pixEnabled,
}: CheckoutFormProps) {
  const router = useRouter()
  const { items, isHydrated, itemCount, subtotalCents, clear } = useCart()

  const [email, setEmail] = React.useState(defaultEmail ?? '')
  const [name, setName] = React.useState(defaultName ?? '')
  const [phone, setPhone] = React.useState('')

  const [couponInput, setCouponInput] = React.useState('')
  const [coupon, setCoupon] = React.useState<{ code: string; discountCents: number } | null>(null)
  const [couponMessage, setCouponMessage] = React.useState<string | null>(null)
  const [couponPending, startCouponTransition] = React.useTransition()

  const [acceptTerms, setAcceptTerms] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [redirecting, setRedirecting] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const [summaryOpen, setSummaryOpen] = React.useState(false)

  // A lista já nasce pronta para outros meios: acrescentar uma entrada com
  // enabled: true é tudo o que falta para o método aparecer aqui.
  const methods = React.useMemo<PaymentMethod[]>(
    () => [
      {
        id: 'pix',
        label: 'Pix',
        description: 'Pague pelo app do banco e receba o produto na hora.',
        highlights: ['Mais rápido', 'Aprovação imediata'],
        icon: QrCode,
        enabled: pixEnabled,
      },
      {
        id: 'credit_card',
        label: 'Cartão de crédito',
        description: 'Em breve.',
        highlights: [],
        icon: CreditCard,
        enabled: false,
      },
      {
        id: 'boleto',
        label: 'Boleto',
        description: 'Em breve.',
        highlights: [],
        icon: Receipt,
        enabled: false,
      },
    ],
    [pixEnabled]
  )

  const availableMethods = React.useMemo(() => methods.filter((m) => m.enabled), [methods])
  const [method, setMethod] = React.useState('pix')

  const discountCents = Math.min(coupon?.discountCents ?? 0, subtotalCents)
  const totalCents = Math.max(0, subtotalCents - discountCents)

  const isEmpty = isHydrated && items.length === 0
  const busy = pending || redirecting
  const canSubmit =
    !busy && !isEmpty && isHydrated && acceptTerms && email.trim() !== '' && availableMethods.length > 0

  // ---------------------------------------------------------------------------
  // Cupom
  // ---------------------------------------------------------------------------
  function handleApplyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (code === '') {
      setCouponMessage('Digite um cupom.')
      return
    }

    startCouponTransition(async () => {
      const result = await validateCouponAction({
        code,
        subtotal_cents: subtotalCents,
        // O e-mail entra na conta porque há cupom com limite por cliente.
        email: email.trim() === '' ? undefined : email.trim(),
      })

      if (!result.valid) {
        setCoupon(null)
        setCouponMessage(result.reason ?? result.error ?? 'Cupom inválido.')
        return
      }

      setCoupon({ code, discountCents: result.discount_cents })
      setCouponMessage(null)
      toast.success(`Cupom ${code} aplicado.`)
    })
  }

  function handleRemoveCoupon() {
    setCoupon(null)
    setCouponInput('')
    setCouponMessage(null)
  }

  // ---------------------------------------------------------------------------
  // Fechamento
  // ---------------------------------------------------------------------------
  function goToOrder(orderId: string) {
    // O convidado não tem sessão: sem o e-mail na URL a página do pedido não
    // teria como provar que ele é o dono e mostraria "pedido não encontrado".
    const query = isLoggedIn ? '' : `?email=${encodeURIComponent(email.trim().toLowerCase())}`

    // A ordem importa: primeiro trava a tela (para o aviso de carrinho vazio
    // não piscar), depois limpa, depois navega.
    setRedirecting(true)
    clear()
    router.push(`/pedido/${orderId}${query}`)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError('Seu carrinho está vazio.')
      return
    }
    if (!acceptTerms) {
      setError('Você precisa aceitar os termos e condições desta compra.')
      return
    }

    startTransition(async () => {
      const result = await createOrderAction({
        items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
        customer_email: email,
        customer_name: name,
        customer_phone: phone,
        coupon_code: coupon?.code,
        accept_terms: acceptTerms,
      })

      if (result.ok) {
        goToOrder(result.orderId)
        return
      }

      // Falhou DEPOIS de o pedido existir (o insert do pagamento caiu). Repetir
      // o checkout criaria um segundo pedido e reservaria estoque de novo — por
      // isso segue para a página do pedido em vez de deixar o cliente tentar.
      if (result.orderId) {
        toast.error(result.error)
        goToOrder(result.orderId)
        return
      }

      setError(result.error)
      toast.error(result.error)
    })
  }

  // ---------------------------------------------------------------------------

  const summary = (
    <Card className="lg:sticky lg:top-24">
      <button
        type="button"
        onClick={() => setSummaryOpen((open) => !open)}
        aria-expanded={summaryOpen}
        aria-controls="resumo-pedido"
        className="flex w-full items-center justify-between gap-2 p-5 text-left lg:hidden"
      >
        <span className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ShoppingCart className="size-4 text-primary" aria-hidden />
          Resumo do pedido
          {isHydrated && itemCount > 0 && (
            <Badge variant="muted">{itemCount}</Badge>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-bold tabular-nums text-foreground">{formatPrice(totalCents)}</span>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              summaryOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </span>
      </button>

      <CardHeader className="hidden lg:flex">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="size-4 text-primary" aria-hidden />
          Resumo do pedido
        </CardTitle>
      </CardHeader>

      <CardContent
        id="resumo-pedido"
        className={cn('space-y-4 p-5 pt-0 lg:block', summaryOpen ? 'block' : 'hidden')}
      >
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">Nenhum item no carrinho.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.product_id} className="flex items-start gap-3">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    width={48}
                    height={48}
                    className="size-12 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Package className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatPrice(item.price_cents)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatPrice(item.price_cents * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Separator />

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatPrice(subtotalCents)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Descontos
              {coupon && <span className="ml-1 text-xs text-success">({coupon.code})</span>}
            </dt>
            <dd
              className={cn(
                'font-medium tabular-nums',
                discountCents > 0 ? 'text-success' : 'text-foreground'
              )}
            >
              {discountCents > 0 ? `- ${formatPrice(discountCents)}` : formatPrice(0)}
            </dd>
          </div>
        </dl>

        <Separator />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            {formatPrice(totalCents)}
          </span>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="size-3.5 text-primary" aria-hidden />
          Entrega digital assim que o pagamento for confirmado.
        </p>
      </CardContent>
    </Card>
  )

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="order-1 lg:order-2">{summary}</div>

        <div className="order-2 space-y-5 lg:order-1">
          {isEmpty && !redirecting && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-warning">Seu carrinho está vazio</p>
                <p className="text-sm text-muted-foreground">
                  Adicione um produto para conseguir finalizar a compra.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/produtos">Ver produtos</Link>
                </Button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- Pagamento */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Formas de pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {availableMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma forma de pagamento está disponível no momento. Tente novamente mais tarde.
                </p>
              ) : (
                <RadioGroup
                  value={method}
                  onValueChange={setMethod}
                  aria-label="Escolha a forma de pagamento"
                  className="gap-3"
                >
                  {availableMethods.map((option) => {
                    const Icon = option.icon
                    const selected = method === option.id

                    return (
                      <Label
                        key={option.id}
                        htmlFor={`pagamento-${option.id}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        )}
                      >
                        <RadioGroupItem
                          value={option.id}
                          id={`pagamento-${option.id}`}
                          className="mt-0.5"
                        />

                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Icon className="size-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">
                              {option.label}
                            </span>
                            {option.highlights.map((tag, index) => (
                              <Badge key={tag} variant={index === 0 ? 'success' : 'muted'}>
                                {tag}
                              </Badge>
                            ))}
                          </span>
                          <span className="block text-sm font-normal text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </Label>
                    )
                  })}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------------ Contato */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações de contato</CardTitle>
              <p className="text-sm text-muted-foreground">
                O produto e o comprovante vão para este e-mail.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="checkout-email">
                  E-mail <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="checkout-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  disabled={busy}
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-nome">Nome</Label>
                  <Input
                    id="checkout-nome"
                    name="nome"
                    autoComplete="name"
                    disabled={busy}
                    placeholder="Como podemos te chamar"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="checkout-telefone">
                    Telefone <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="checkout-telefone"
                    name="telefone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    disabled={busy}
                    placeholder="(11) 90000-0000"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>

              {!isLoggedIn && (
                <p className="text-xs text-muted-foreground">
                  Comprando como convidado.{' '}
                  <Link
                    href="/login?next=%2Fcheckout"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Entrar na conta
                  </Link>{' '}
                  guarda o pedido no seu histórico.
                </p>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------------- Cupom */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ticket className="size-4 text-primary" aria-hidden />
                Cupom de desconto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {coupon ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-success/25 bg-success/10 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tag className="size-4 shrink-0 text-success" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-success">{coupon.code}</p>
                      <p className="text-xs text-muted-foreground">
                        Desconto de {formatPrice(discountCents)} aplicado.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleRemoveCoupon}
                    disabled={busy}
                    aria-label="Remover cupom"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      id="checkout-cupom"
                      name="cupom"
                      autoCapitalize="characters"
                      spellCheck={false}
                      disabled={busy || couponPending}
                      placeholder="Digite o código"
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                      onKeyDown={(event) => {
                        // Enter dentro do campo não pode disparar o submit do
                        // formulário inteiro — aqui ele aplica o cupom.
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleApplyCoupon()
                        }
                      }}
                      aria-describedby={couponMessage ? 'cupom-erro' : undefined}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleApplyCoupon}
                      disabled={busy || couponPending || couponInput.trim() === ''}
                    >
                      {couponPending && <Loader2 className="animate-spin" />}
                      Aplicar
                    </Button>
                  </div>

                  {couponMessage && (
                    <p id="cupom-erro" className="text-sm text-destructive" role="alert">
                      {couponMessage}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ Termos e envio */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="checkout-termos"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                  disabled={busy}
                  aria-describedby="checkout-termos-texto"
                />
                <Label
                  htmlFor="checkout-termos"
                  id="checkout-termos-texto"
                  className="cursor-pointer text-sm font-normal leading-relaxed text-muted-foreground"
                >
                  Eu aceito os{' '}
                  <Link
                    href={termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    termos e condições
                  </Link>{' '}
                  desta compra.
                </Label>
              </div>

              {error && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
                {busy ? <Loader2 className="animate-spin" /> : <Lock />}
                {redirecting ? 'Abrindo o pagamento...' : `Pagar ${formatPrice(totalCents)}`}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                O valor final é conferido no servidor no momento do fechamento.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
