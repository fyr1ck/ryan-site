'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { ImageUpload } from '@/components/admin/image-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { createCategory, updateCategory } from '@/actions/categories'
import { cn, slugify } from '@/lib/utils'

const NO_PARENT = '__root__'

export interface CategoryOption {
  id: string
  name: string
  parent_id: string | null
}

export interface CategoryFormInitial {
  id?: string
  name: string
  slug: string
  description: string
  parent_id: string | null
  image_url: string | null
  banner_url: string | null
  position: number
  is_active: boolean
  is_featured: boolean
  show_on_home: boolean
  seo_title: string
  seo_description: string
}

export const EMPTY_CATEGORY: CategoryFormInitial = {
  name: '',
  slug: '',
  description: '',
  parent_id: null,
  image_url: null,
  banner_url: null,
  position: 0,
  is_active: true,
  is_featured: false,
  show_on_home: false,
  seo_title: '',
  seo_description: '',
}

export interface CategoryFormProps {
  mode: 'create' | 'edit'
  initial: CategoryFormInitial
  categories: CategoryOption[]
}

/**
 * Ids que não podem ser pai desta categoria: ela mesma e a descendência
 * inteira. O banco também barra (trigger de ciclo), mas quem está mexendo no
 * menu merece ver a opção sumir da lista em vez de descobrir no submit.
 */
function blockedParents(categoryId: string | undefined, all: CategoryOption[]): Set<string> {
  const blocked = new Set<string>()
  if (!categoryId) return blocked

  blocked.add(categoryId)
  const queue = [categoryId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const candidate of all) {
      if (candidate.parent_id === current && !blocked.has(candidate.id)) {
        blocked.add(candidate.id)
        queue.push(candidate.id)
      }
    }
  }
  return blocked
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max
  return (
    <span className={cn('text-xs tabular-nums', over ? 'text-warning' : 'text-muted-foreground')}>
      {value.length}/{max}
    </span>
  )
}

interface ToggleRowProps {
  id: string
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function ToggleRow({ id, label, hint, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  )
}

export function CategoryForm({ mode, initial, categories }: CategoryFormProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const [name, setName] = React.useState(initial.name)
  const [slug, setSlug] = React.useState(initial.slug)
  const [description, setDescription] = React.useState(initial.description)
  const [parentId, setParentId] = React.useState(initial.parent_id ?? NO_PARENT)
  const [imageUrl, setImageUrl] = React.useState(initial.image_url)
  const [bannerUrl, setBannerUrl] = React.useState(initial.banner_url)
  const [position, setPosition] = React.useState(String(initial.position))
  const [isActive, setIsActive] = React.useState(initial.is_active)
  const [isFeatured, setIsFeatured] = React.useState(initial.is_featured)
  const [showOnHome, setShowOnHome] = React.useState(initial.show_on_home)
  const [seoTitle, setSeoTitle] = React.useState(initial.seo_title)
  const [seoDescription, setSeoDescription] = React.useState(initial.seo_description)

  const blocked = React.useMemo(
    () => blockedParents(initial.id, categories),
    [initial.id, categories]
  )

  const parentOptions = categories.filter((category) => !blocked.has(category.id))

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (name.trim().length < 2) {
      toast.error('O nome precisa ter pelo menos 2 caracteres.')
      return
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description,
      parent_id: parentId === NO_PARENT ? null : parentId,
      image_url: imageUrl,
      banner_url: bannerUrl,
      position: Number.parseInt(position, 10) || 0,
      is_active: isActive,
      is_featured: isFeatured,
      show_on_home: showOnHome,
      seo_title: seoTitle,
      seo_description: seoDescription,
    }

    setPending(true)
    try {
      const result =
        mode === 'create'
          ? await createCategory(payload)
          : await updateCategory({ ...payload, id: initial.id })

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar a categoria.')
        return
      }

      toast.success(mode === 'create' ? 'Categoria criada.' : 'Categoria salva.')
      router.push('/admin/categorias')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pb-24">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="space-y-4 lg:col-span-2 lg:space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Básico</CardTitle>
              <CardDescription>Nome e endereço da categoria na loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                  placeholder="Blox Fruits"
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
                    placeholder="blox-fruits"
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
                  Endereço na loja: /categoria/{slug || slugify(name) || 'sua-categoria'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Contas, frutas e gamepasses de Blox Fruits"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="parent">Categoria pai</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger id="parent">
                    <SelectValue placeholder="Categoria raiz" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>Categoria raiz (sem pai)</SelectItem>
                    {parentOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A própria categoria e as que estão dentro dela não aparecem nesta lista.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagens</CardTitle>
              <CardDescription>
                A imagem aparece no card da categoria; o banner, no topo da página dela.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Imagem</Label>
                <ImageUpload
                  bucket="categories"
                  folder="categorias"
                  aspect="square"
                  value={imageUrl}
                  onChange={setImageUrl}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Banner</Label>
                <ImageUpload
                  bucket="categories"
                  folder="banners"
                  value={bannerUrl}
                  onChange={setBannerUrl}
                  disabled={pending}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>Como a categoria aparece no Google.</CardDescription>
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
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exibição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                id="is_active"
                label="Categoria ativa"
                hint="Inativa some da loja, mas continua aqui no painel."
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <ToggleRow
                id="is_featured"
                label="Aparece em Categorias populares"
                hint="Entra no bloco de categorias em destaque da home."
                checked={isFeatured}
                onCheckedChange={setIsFeatured}
              />
              <ToggleRow
                id="show_on_home"
                label="Tem carrossel próprio na home"
                hint="Ganha uma faixa de produtos só dela na página inicial."
                checked={showOnHome}
                onCheckedChange={setShowOnHome}
              />

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="position">Posição</Label>
                <Input
                  id="position"
                  value={position}
                  onChange={(event) =>
                    setPosition(event.target.value.replace(/[^\d]/g, '').slice(0, 5))
                  }
                  inputMode="numeric"
                  className="max-w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Menor número aparece primeiro. Dá para arrastar na listagem também.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur lg:pl-60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/admin/categorias')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Salvando…' : mode === 'create' ? 'Criar categoria' : 'Salvar'}
          </Button>
        </div>
      </div>
    </form>
  )
}
