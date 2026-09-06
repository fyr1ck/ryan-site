'use client'

import * as React from 'react'

import { PRODUCTS_PATH, SORT_OPTIONS } from '@/lib/catalog-options'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Filtros, busca e ordenação da listagem /produtos.
 *
 * Regra que vale para o arquivo inteiro: o estado mora na URL, nunca em
 * useState. Cada controle é um <input> de verdade dentro de um
 * <form action="/produtos" method="get"> — o navegador sozinho já saberia
 * montar a querystring. O onSubmit apenas intercepta para navegar pelo router
 * do Next (sem recarregar a página); sem JS, o form GET continua funcionando.
 *
 * Consequências boas disso: o link é compartilhável, o botão voltar desfaz um
 * filtro por vez e a página continua sendo Server Component.
 */

/** Par [chave, valor] da querystring atual. */
export type ParamEntry = [string, string]

export interface FilterCategoryNode {
  id: string
  name: string
  slug: string
  children: { id: string; name: string; slug: string }[]
}

export interface ProductFilterValues {
  categoria: string
  min: string
  max: string
  tags: string[]
  disponiveis: boolean
  promocao: boolean
}

/** Monta "/produtos?a=1&b=2" a partir dos pares já normalizados pela página. */
function hrefFrom(entries: ParamEntry[]): string {
  const params = new URLSearchParams(entries)
  const query = params.toString()
  return query ? `${PRODUCTS_PATH}?${query}` : PRODUCTS_PATH
}

/**
 * Submissão GET via router: lê o próprio form, descarta campos vazios e
 * navega. `pagina` fica de fora de propósito — mudar um filtro tem que voltar
 * para a primeira página, senão o cliente cai num "nenhum resultado" que na
 * verdade é a página 7 de um recorte que agora só tem 2.
 */
function useGetSubmit(onDone?: () => void) {
  const router = useRouter()

  return React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const params = new URLSearchParams()
      for (const [key, value] of new FormData(event.currentTarget).entries()) {
        if (typeof value !== 'string') continue
        const text = value.trim()
        if (text) params.append(key, text)
      }

      const query = params.toString()
      router.push(query ? `${PRODUCTS_PATH}?${query}` : PRODUCTS_PATH)
      onDone?.()
    },
    [router, onDone]
  )
}

/** Campos que este form não controla, repassados para não se perderem. */
function HiddenParams({ entries }: { entries: ParamEntry[] }) {
  return (
    <>
      {entries.map(([key, value], index) => (
        <input key={`${key}-${value}-${index}`} type="hidden" name={key} value={value} readOnly />
      ))}
    </>
  )
}

interface CheckFieldProps {
  name: string
  value: string
  label: React.ReactNode
  defaultChecked: boolean
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
}

/**
 * Checkbox nativo com aparência da loja.
 *
 * Não usa o <Checkbox> do Radix aqui porque ele é um <button> controlado por
 * estado do React: dentro de um form GET, precisamos do input nativo para que
 * o FormData (e o fallback sem JS) enxerguem a marcação.
 */
function CheckField({
  name,
  value,
  label,
  defaultChecked,
  onChange,
  className,
}: CheckFieldProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md py-1 text-sm',
        'text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
    >
      <span className="relative flex shrink-0 items-center">
        <input
          type="checkbox"
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          onChange={onChange}
          className={cn(
            'peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-input bg-card',
            'transition-colors checked:border-primary checked:bg-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
    </label>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h3>
      {children}
    </section>
  )
}

export interface ProductFiltersPanelProps {
  categories: FilterCategoryNode[]
  tags: string[]
  values: ProductFilterValues
  /** `q` e `ordem` da URL atual — o form de filtros não os controla. */
  preserved: ParamEntry[]
  /**
   * Aplica assim que um checkbox muda. Ligado na coluna lateral (o resultado
   * está à vista) e desligado no Sheet, onde o cliente marca várias opções
   * antes de tocar em "Ver resultados".
   */
  autoSubmit?: boolean
  onApplied?: () => void
  applySlot?: React.ReactNode
  className?: string
}

export function ProductFiltersPanel({
  categories,
  tags,
  values,
  preserved,
  autoSubmit = false,
  onApplied,
  applySlot,
  className,
}: ProductFiltersPanelProps) {
  const handleSubmit = useGetSubmit(onApplied)

  const submitNow = React.useCallback((form: HTMLFormElement | null) => {
    if (!autoSubmit) return
    form?.requestSubmit()
  }, [autoSubmit])

  /**
   * Categoria é filtro único (searchProducts recebe um slug só), então marcar
   * uma desmarca as outras. É DOM puro de propósito: os inputs são não
   * controlados e o form remonta a cada navegação — ver `key` mais abaixo.
   */
  const handleCategoryChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const form = input.form
      if (form && input.checked) {
        form
          .querySelectorAll<HTMLInputElement>('input[name="categoria"]')
          .forEach((other) => {
            if (other !== input) other.checked = false
          })
      }
      submitNow(form)
    },
    [submitNow]
  )

  const handleToggleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => submitNow(event.currentTarget.form),
    [submitNow]
  )

  const hasFilters =
    Boolean(values.categoria || values.min || values.max) ||
    values.tags.length > 0 ||
    values.disponiveis ||
    values.promocao

  return (
    <form
      /**
       * O form é não controlado (defaultValue/defaultChecked). Sem esta key os
       * inputs manteriam o estado antigo do DOM depois de uma navegação —
       * "Limpar filtros" limparia a URL mas deixaria os quadradinhos marcados.
       */
      key={JSON.stringify([values, preserved])}
      action={PRODUCTS_PATH}
      method="get"
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-6', className)}
      aria-label="Filtros do catálogo"
    >
      <HiddenParams entries={preserved} />

      {categories.length > 0 && (
        <FilterSection title="Categorias">
          <div className="flex flex-col">
            {categories.map((parent) => (
              <React.Fragment key={parent.id}>
                <CheckField
                  name="categoria"
                  value={parent.slug}
                  label={parent.name}
                  defaultChecked={values.categoria === parent.slug}
                  onChange={handleCategoryChange}
                  className="font-medium text-foreground"
                />
                {parent.children.map((child) => (
                  <CheckField
                    key={child.id}
                    name="categoria"
                    value={child.slug}
                    label={child.name}
                    defaultChecked={values.categoria === child.slug}
                    onChange={handleCategoryChange}
                    className="ml-3 border-l border-border pl-3 text-xs sm:text-sm"
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </FilterSection>
      )}

      <FilterSection title="Faixa de preço">
        <div className="flex items-center gap-2">
          <Input
            name="min"
            type="text"
            inputMode="decimal"
            defaultValue={values.min}
            placeholder="Mínimo"
            aria-label="Preço mínimo em reais"
            className="h-9 text-sm"
          />
          <span className="shrink-0 text-xs text-muted-foreground">até</span>
          <Input
            name="max"
            type="text"
            inputMode="decimal"
            defaultValue={values.max}
            placeholder="Máximo"
            aria-label="Preço máximo em reais"
            className="h-9 text-sm"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Valores em reais, ex.: 19,90</p>
      </FilterSection>

      <FilterSection title="Disponibilidade">
        <CheckField
          name="disponiveis"
          value="1"
          label="Somente disponíveis"
          defaultChecked={values.disponiveis}
          onChange={handleToggleChange}
        />
        <CheckField
          name="promocao"
          value="1"
          label="Somente em promoção"
          defaultChecked={values.promocao}
          onChange={handleToggleChange}
        />
      </FilterSection>

      {tags.length > 0 && (
        <FilterSection title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <label key={tag} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="tags"
                  value={tag}
                  defaultChecked={values.tags.includes(tag)}
                  onChange={handleToggleChange}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs',
                    'text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
                    'peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background'
                  )}
                >
                  {tag}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      <div className="flex flex-col gap-2">
        {applySlot ?? (
          <Button type="submit" className="w-full">
            Aplicar filtros
          </Button>
        )}

        {hasFilters && (
          <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground">
            <Link href={hrefFrom(preserved)}>
              <RotateCcw aria-hidden />
              Limpar filtros
            </Link>
          </Button>
        )}
      </div>
    </form>
  )
}

export interface ProductFiltersSheetProps
  extends Omit<ProductFiltersPanelProps, 'autoSubmit' | 'onApplied' | 'applySlot'> {
  /** Quantos filtros estão ativos — vira o contador no botão "Filtrar". */
  activeCount?: number
}

/** Botão "Filtrar" + painel em gaveta. Só existe abaixo do lg:. */
export function ProductFiltersSheet({
  activeCount = 0,
  className,
  ...panelProps
}: ProductFiltersSheetProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className={cn('shrink-0', className)}>
          <SlidersHorizontal aria-hidden />
          Filtrar
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-[88%] max-w-sm gap-4">
        <SheetHeader>
          <SheetTitle>Filtrar produtos</SheetTitle>
          <SheetDescription>
            Escolha as opções e toque em “Ver resultados”.
          </SheetDescription>
        </SheetHeader>

        <ProductFiltersPanel
          {...panelProps}
          autoSubmit={false}
          onApplied={() => setOpen(false)}
          applySlot={
            <Button type="submit" size="lg" className="w-full">
              Ver resultados
            </Button>
          }
        />
      </SheetContent>
    </Sheet>
  )
}

export interface ProductToolbarProps {
  q: string
  ordem: string
  /** Todos os filtros da URL atual — a barra só controla `q` e `ordem`. */
  preserved: ParamEntry[]
  className?: string
}

/** Barra superior: campo de busca + ordenação, ambos no mesmo form GET. */
export function ProductToolbar({ q, ordem, preserved, className }: ProductToolbarProps) {
  const handleSubmit = useGetSubmit()

  return (
    <form
      key={JSON.stringify([q, ordem, preserved])}
      action={PRODUCTS_PATH}
      method="get"
      onSubmit={handleSubmit}
      role="search"
      className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', className)}
    >
      <HiddenParams entries={preserved} />

      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar no catálogo"
          aria-label="Buscar produtos"
          enterKeyHint="search"
          className="pl-9"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor="ordem" className="hidden text-xs text-muted-foreground sm:block">
          Ordenar
        </label>
        <select
          id="ordem"
          name="ordem"
          defaultValue={ordem}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className={cn(
            'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground sm:w-48',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
          )}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sem JS o select não navega sozinho, mas o Enter no campo de busca
          submete o form GET com a ordenação escolhida junto. */}
      <button type="submit" className="sr-only">
        Aplicar
      </button>
    </form>
  )
}
