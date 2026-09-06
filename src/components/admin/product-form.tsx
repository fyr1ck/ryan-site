'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Boxes, Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'

import { ImageManager, type ManagedImage } from '@/components/admin/image-manager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createProduct, updateProduct } from '@/actions/products'
import type { DeliveryType, ProductStatus, StockPolicy } from '@/lib/types/database.types'
import { centsToInput, cn, formatPrice, parsePriceToCents, slugify } from '@/lib/utils'

// =============================================================================
// Formulário de produto — o mesmo componente serve /novo e /[id].
//
// O estado vive aqui em memória e vai inteiro para a Server Action no submit.
// Nada de salvar campo a campo: um produto meio salvo (com preço novo e
// estoque velho) é pior do que um produto não salvo.
// =============================================================================

/** Radix Select não aceita item com value="" — este é o "sem categoria". */
const NO_CATEGORY = '__none__'

const STATUS_OPTIONS: { value: ProductStatus; label: string; hint: string }[] = [
  { value: 'draft', label: 'Rascunho', hint: 'Só você vê. Não aparece na loja.' },
  { value: 'active', label: 'Ativo', hint: 'Publicado e vendendo.' },
  { value: 'archived', label: 'Arquivado', hint: 'Fora da loja, mas o histórico continua.' },
]

const DELIVERY_OPTIONS: { value: DeliveryType; label: string; hint: string }[] = [
  { value: 'automatic', label: 'Automática', hint: 'O cliente recebe na hora do pagamento.' },
  { value: 'manual', label: 'Manual', hint: 'Você entrega depois, pelo painel.' },
]

const STOCK_OPTIONS: { value: StockPolicy; label: string; hint: string }[] = [
  { value: 'unlimited', label: 'Ilimitado', hint: 'Sempre disponível (Robux, serviços).' },
  { value: 'manual', label: 'Quantidade fixa', hint: 'Você controla o número na mão.' },
  { value: 'digital_keys', label: 'Chaves digitais', hint: 'Cada código é uma unidade.' },
]

export interface ProductFormCategory {
  id: string
  name: string
  parent_id: string | null
}

export interface ProductFormCollection {
  id: string
  name: string
}

export interface ProductFormInitial {
  id?: string
  name: string
  slug: string
  short_description: string
  description: string
  price_cents: number
  compare_at_cents: number | null
  cost_cents: number | null
  sku: string
  status: ProductStatus
  category_id: string | null
  delivery_type: DeliveryType
  stock_policy: StockPolicy
  stock_quantity: number
  tags: string[]
  is_featured: boolean
  seo_title: string
  seo_description: string
  images: { url: string; alt: string | null }[]
  collection_ids: string[]
  category_ids: string[]
}

export const EMPTY_PRODUCT: ProductFormInitial = {
  name: '',
  slug: '',
  short_description: '',
  description: '',
  price_cents: 0,
  compare_at_cents: null,
  cost_cents: null,
  sku: '',
  status: 'draft',
  category_id: null,
  delivery_type: 'automatic',
  stock_policy: 'manual',
  stock_quantity: 0,
  tags: [],
  is_featured: false,
  seo_title: '',
  seo_description: '',
  images: [],
  collection_ids: [],
  category_ids: [],
}

export interface ProductFormProps {
  mode: 'create' | 'edit'
  initial: ProductFormInitial
  categories: ProductFormCategory[]
  collections: ProductFormCollection[]
}

/** Nome com o pai na frente, para o Select não ter dois "Contas". */
function categoryLabel(category: ProductFormCategory, all: ProductFormCategory[]): string {
  if (!category.parent_id) return category.name
  const parent = all.find((item) => item.id === category.parent_id)
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/** Contador de caracteres do SEO: vira aviso quando passa do que o Google mostra. */
function CharacterCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max
  return (
    <span className={cn('text-xs tabular-nums', over ? 'text-warning' : 'text-muted-foreground')}>
      {value.length}/{max}
    </span>
  )
}

export function ProductForm({ mode, initial, categories, collections }: ProductFormProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const [name, setName] = React.useState(initial.name)
  const [slug, setSlug] = React.useState(initial.slug)
  const [shortDescription, setShortDescription] = React.useState(initial.short_description)
  const [description, setDescription] = React.useState(initial.description)

  const [priceInput, setPriceInput] = React.useState(centsToInput(initial.price_cents))
  const [compareInput, setCompareInput] = React.useState(centsToInput(initial.compare_at_cents))
  const [costInput, setCostInput] = React.useState(centsToInput(initial.cost_cents))
  const [sku, setSku] = React.useState(initial.sku)

  const [categoryId, setCategoryId] = React.useState(initial.category_id ?? NO_CATEGORY)
  const [collectionIds, setCollectionIds] = React.useState<string[]>(initial.collection_ids)
  const [extraCategoryIds, setExtraCategoryIds] = React.useState<string[]>(initial.category_ids)
  const [tags, setTags] = React.useState<string[]>(initial.tags)
  const [tagDraft, setTagDraft] = React.useState('')

  const [deliveryType, setDeliveryType] = React.useState<DeliveryType>(initial.delivery_type)
  const [stockPolicy, setStockPolicy] = React.useState<StockPolicy>(initial.stock_policy)
  const [stockQuantity, setStockQuantity] = React.useState(String(initial.stock_quantity))

  // Id determinístico (índice + url): gerar UUID aqui quebraria a hidratação,
  // porque o servidor e o navegador sortariam valores diferentes.
  const [images, setImages] = React.useState<ManagedImage[]>(() =>
    initial.images.map((image, index) => ({
      id: `img-${index}-${image.url}`,
      url: image.url,
      alt: image.alt,
    }))
  )

  const [status, setStatus] = React.useState<ProductStatus>(initial.status)
  const [isFeatured, setIsFeatured] = React.useState(initial.is_featured)

  const [seoTitle, setSeoTitle] = React.useState(initial.seo_title)
  const [seoDescription, setSeoDescription] = React.useState(initial.seo_description)

  const priceCents = parsePriceToCents(priceInput)
  const compareCents = compareInput.trim() ? parsePriceToCents(compareInput) : null
  const costCents = costInput.trim() ? parsePriceToCents(costInput) : null

  const compareInvalid = compareCents !== null && compareCents <= priceCents
  const margin = costCents !== null ? priceCents - costCents : null

  const rootCategories = categories.filter((category) => !category.parent_id)
  const childCategories = categories.filter((category) => category.parent_id)

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
  }

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,+$/, '').slice(0, 40)
    if (!tag) return
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTagDraft('')
      return
    }
    if (tags.length >= 30) {
      toast.error('Máximo de 30 tags por produto.')
      return
    }
    setTags([...tags, tag])
    setTagDraft('')
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter dentro de um input envia o formulário por padrão; aqui ele
      // significa "fechei a tag", nunca "salvei o produto".
      event.preventDefault()
      addTag(tagDraft)
      return
    }
    if (event.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (name.trim().length < 2) {
      toast.error('O nome precisa ter pelo menos 2 caracteres.')
      return
    }
    if (compareInvalid) {
      toast.error('O preço "de" precisa ser maior que o preço de venda.')
      return
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      short_description: shortDescription,
      description,
      price_cents: priceCents,
      compare_at_cents: compareCents,
      cost_cents: costCents,
      sku,
      status,
      category_id: categoryId === NO_CATEGORY ? null : categoryId,
      delivery_type: deliveryType,
      stock_policy: stockPolicy,
      stock_quantity: Number.parseInt(stockQuantity, 10) || 0,
      tags,
      is_featured: isFeatured,
      seo_title: seoTitle,
      seo_description: seoDescription,
      images: images.map((image) => ({ url: image.url, alt: image.alt })),
      collection_ids: collectionIds,
      category_ids: extraCategoryIds,
    }

    setPending(true)
    try {
      const result =
        mode === 'create'
          ? await createProduct(payload)
          : await updateProduct({ ...payload, id: initial.id })

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar o produto.')
        return
      }

      toast.success(mode === 'create' ? 'Produto criado.' : 'Produto salvo.')

      if (mode === 'create' && result.id) {
        router.push(`/admin/produtos/${result.id}`)
      } else {
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pb-24">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="space-y-4 lg:col-span-2 lg:space-y-5">
          {/* ---------------------------------------------------------- Básico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Básico</CardTitle>
              <CardDescription>Como o produto aparece na loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={200}
                  required
                  placeholder="Conta Blox Fruits nível máximo"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug</Label>
                <div className="flex gap-2">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    maxLength={160}
                    placeholder="conta-blox-fruits-nivel-maximo"
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSlug(slugify(name))}
                    disabled={!name.trim()}
                    className="shrink-0"
                  >
                    <Sparkles />
                    <span className="hidden sm:inline">Gerar do nome</span>
                    <span className="sm:hidden">Gerar</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Endereço na loja: /produto/{slug || slugify(name) || 'seu-produto'}. Em branco, é
                  gerado do nome.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="short_description">Descrição curta</Label>
                <Input
                  id="short_description"
                  value={shortDescription}
                  onChange={(event) => setShortDescription(event.target.value)}
                  maxLength={300}
                  placeholder="Entrega imediata, conta verificada"
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no card do produto e nas listagens.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={12}
                  maxLength={50_000}
                  placeholder="<p>O que vem na conta, como funciona a entrega, o que o cliente precisa saber…</p>"
                  className="min-h-56 font-mono text-[13px] leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">
                  Aceita HTML simples (parágrafos, listas, negrito). Tudo é limpo no servidor antes
                  de aparecer na loja.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ----------------------------------------------------------- Preço */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preço</CardTitle>
              <CardDescription>Valores em reais. O desconto aparece sozinho na loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Preço</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="price"
                      value={priceInput}
                      onChange={(event) => setPriceInput(event.target.value)}
                      onBlur={() => setPriceInput(centsToInput(parsePriceToCents(priceInput)))}
                      inputMode="decimal"
                      placeholder="69,90"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="compare_at">Preço comparativo (&quot;de&quot;)</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="compare_at"
                      value={compareInput}
                      onChange={(event) => setCompareInput(event.target.value)}
                      onBlur={() =>
                        setCompareInput(
                          compareInput.trim()
                            ? centsToInput(parsePriceToCents(compareInput))
                            : ''
                        )
                      }
                      inputMode="decimal"
                      placeholder="99,90"
                      aria-invalid={compareInvalid}
                      className={cn('pl-9', compareInvalid && 'border-destructive')}
                    />
                  </div>
                  {compareInvalid ? (
                    <p className="text-xs text-destructive">
                      Precisa ser maior que o preço de venda. Deixe em branco se não há promoção.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Preço riscado. Vazio = sem promoção.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cost">Custo</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="cost"
                      value={costInput}
                      onChange={(event) => setCostInput(event.target.value)}
                      onBlur={() =>
                        setCostInput(costInput.trim() ? centsToInput(parsePriceToCents(costInput)) : '')
                      }
                      inputMode="decimal"
                      placeholder="30,00"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uso interno: nunca aparece na loja.
                    {margin !== null && (
                      <>
                        {' '}Margem:{' '}
                        <strong className={margin >= 0 ? 'text-success' : 'text-destructive'}>
                          {formatPrice(margin)}
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={sku}
                    onChange={(event) => setSku(event.target.value)}
                    maxLength={100}
                    placeholder="BF-CONTA-MAX"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Seu código interno. Precisa ser único.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ---------------------------------------------------- Organização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organização</CardTitle>
              <CardDescription>Onde este produto aparece na navegação da loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="category">Categoria principal</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                    {rootCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                    {childCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryLabel(category, categories)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  É a categoria que aparece no caminho (breadcrumb) do produto.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Coleções</legend>
                {collections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma coleção criada ainda.{' '}
                    <Link href="/admin/colecoes/nova" className="text-primary hover:underline">
                      Criar coleção
                    </Link>
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {collections.map((collection) => (
                      <label
                        key={collection.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card/40 px-3 py-2 text-sm transition-colors hover:border-primary/40"
                      >
                        <Checkbox
                          checked={collectionIds.includes(collection.id)}
                          onCheckedChange={() =>
                            setCollectionIds(toggleId(collectionIds, collection.id))
                          }
                        />
                        <span className="min-w-0 truncate">{collection.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Categorias adicionais</legend>
                <p className="text-xs text-muted-foreground">
                  O produto também aparece nos carrosséis destas categorias.
                </p>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma categoria criada ainda.{' '}
                    <Link href="/admin/categorias/nova" className="text-primary hover:underline">
                      Criar categoria
                    </Link>
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categories
                      .filter((category) => category.id !== categoryId)
                      .map((category) => (
                        <label
                          key={category.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card/40 px-3 py-2 text-sm transition-colors hover:border-primary/40"
                        >
                          <Checkbox
                            checked={extraCategoryIds.includes(category.id)}
                            onCheckedChange={() =>
                              setExtraCategoryIds(toggleId(extraCategoryIds, category.id))
                            }
                          />
                          <span className="min-w-0 truncate">
                            {categoryLabel(category, categories)}
                          </span>
                        </label>
                      ))}
                  </div>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags</Label>
                {tags.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 pb-1">
                    {tags.map((tag) => (
                      <li key={tag}>
                        <Badge variant="secondary" className="gap-1 py-1 pr-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => setTags(tags.filter((item) => item !== tag))}
                            aria-label={`Remover a tag ${tag}`}
                            className="grid size-4 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <Input
                  id="tags"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagDraft)}
                  maxLength={40}
                  placeholder="Digite e aperte Enter"
                />
                <p className="text-xs text-muted-foreground">
                  As tags entram na busca da loja e nos filtros.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------------------------- Entrega e estoque */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entrega e estoque</CardTitle>
              <CardDescription>Como o cliente recebe e quantas unidades existem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="delivery_type">Tipo de entrega</Label>
                  <Select
                    value={deliveryType}
                    onValueChange={(value) => setDeliveryType(value as DeliveryType)}
                  >
                    <SelectTrigger id="delivery_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {DELIVERY_OPTIONS.find((option) => option.value === deliveryType)?.hint}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stock_policy">Controle de estoque</Label>
                  <Select
                    value={stockPolicy}
                    onValueChange={(value) => setStockPolicy(value as StockPolicy)}
                  >
                    <SelectTrigger id="stock_policy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {STOCK_OPTIONS.find((option) => option.value === stockPolicy)?.hint}
                  </p>
                </div>
              </div>

              {stockPolicy === 'manual' && (
                <div className="space-y-1.5">
                  <Label htmlFor="stock_quantity">Quantidade em estoque</Label>
                  <Input
                    id="stock_quantity"
                    value={stockQuantity}
                    onChange={(event) =>
                      setStockQuantity(event.target.value.replace(/[^\d]/g, '').slice(0, 7))
                    }
                    inputMode="numeric"
                    placeholder="10"
                    className="max-w-40"
                  />
                  <p className="text-xs text-muted-foreground">
                    O que está reservado por pedidos em aberto é descontado automaticamente.
                  </p>
                </div>
              )}

              {stockPolicy === 'digital_keys' && (
                <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2 text-sm">
                    <Boxes className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      O estoque deste produto é a quantidade de chaves disponíveis. Cadastre os
                      códigos na aba Estoque — o número aqui não é usado.
                    </span>
                  </p>
                  {initial.id ? (
                    <Button asChild type="button" variant="outline" size="sm" className="shrink-0">
                      <Link href={`/admin/estoque?produto=${initial.id}`}>Abrir estoque</Link>
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Salve o produto para cadastrar as chaves.
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------------------- Imagens */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagens</CardTitle>
              <CardDescription>
                A primeira é a capa. Arraste pelo punho para trocar a ordem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImageManager value={images} onChange={setImages} disabled={pending} />
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------ Coluna da direita */}
        <div className="space-y-4 lg:space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="status">Situação</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {STATUS_OPTIONS.find((option) => option.value === status)?.hint}
                </p>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="is_featured" className="cursor-pointer">
                    Produto destaque
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Aparece no bloco de destaques da home.
                  </p>
                </div>
                <Switch
                  id="is_featured"
                  checked={isFeatured}
                  onCheckedChange={setIsFeatured}
                  className="shrink-0"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>Como o produto aparece no Google.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="seo_title">Título</Label>
                  <CharacterCount value={seoTitle} max={60} />
                </div>
                <Input
                  id="seo_title"
                  value={seoTitle}
                  onChange={(event) => setSeoTitle(event.target.value)}
                  maxLength={200}
                  placeholder={name || 'Título para buscadores'}
                />
                <p className="text-xs text-muted-foreground">
                  Em branco, usa o nome do produto.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="seo_description">Descrição</Label>
                  <CharacterCount value={seoDescription} max={160} />
                </div>
                <Textarea
                  id="seo_description"
                  value={seoDescription}
                  onChange={(event) => setSeoDescription(event.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder="Resumo de uma linha que aparece abaixo do título no Google."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* --------------------------------------------- Barra fixa de ações */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur lg:pl-60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/admin/produtos')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Salvando…' : mode === 'create' ? 'Criar produto' : 'Salvar'}
          </Button>
        </div>
      </div>
    </form>
  )
}
