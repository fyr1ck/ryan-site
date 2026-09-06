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
import { Switch } from '@/components/ui/switch'
import { createCollection, updateCollection } from '@/actions/collections'
import { cn, slugify } from '@/lib/utils'

export interface CollectionFormInitial {
  id?: string
  name: string
  slug: string
  description: string
  image_url: string | null
  banner_url: string | null
  is_active: boolean
  show_on_home: boolean
  seo_title: string
  seo_description: string
}

export const EMPTY_COLLECTION: CollectionFormInitial = {
  name: '',
  slug: '',
  description: '',
  image_url: null,
  banner_url: null,
  is_active: true,
  show_on_home: false,
  seo_title: '',
  seo_description: '',
}

export interface CollectionFormProps {
  mode: 'create' | 'edit'
  initial: CollectionFormInitial
  /** Gerenciador de produtos — só existe na edição. */
  productsSlot?: React.ReactNode
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max
  return (
    <span className={cn('text-xs tabular-nums', over ? 'text-warning' : 'text-muted-foreground')}>
      {value.length}/{max}
    </span>
  )
}

export function CollectionForm({ mode, initial, productsSlot }: CollectionFormProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const [name, setName] = React.useState(initial.name)
  const [slug, setSlug] = React.useState(initial.slug)
  const [description, setDescription] = React.useState(initial.description)
  const [imageUrl, setImageUrl] = React.useState(initial.image_url)
  const [bannerUrl, setBannerUrl] = React.useState(initial.banner_url)
  const [isActive, setIsActive] = React.useState(initial.is_active)
  const [showOnHome, setShowOnHome] = React.useState(initial.show_on_home)
  const [seoTitle, setSeoTitle] = React.useState(initial.seo_title)
  const [seoDescription, setSeoDescription] = React.useState(initial.seo_description)

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
      image_url: imageUrl,
      banner_url: bannerUrl,
      is_active: isActive,
      show_on_home: showOnHome,
      seo_title: seoTitle,
      seo_description: seoDescription,
    }

    setPending(true)
    try {
      const result =
        mode === 'create'
          ? await createCollection(payload)
          : await updateCollection({ ...payload, id: initial.id })

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar a coleção.')
        return
      }

      toast.success(mode === 'create' ? 'Coleção criada.' : 'Coleção salva.')

      if (mode === 'create' && result.id) {
        // Vai direto para a edição: é lá que dá para escolher os produtos.
        router.push(`/admin/colecoes/${result.id}`)
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Básico</CardTitle>
              <CardDescription>
                Coleção agrupa produtos de categorias diferentes — “Promoções”, “Mais vendidos”.
              </CardDescription>
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
                  placeholder="Mais vendidos"
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
                    placeholder="mais-vendidos"
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
                  Endereço na loja: /colecao/{slug || slugify(name) || 'sua-colecao'}
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
                  placeholder="O que os clientes mais levam desta loja."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagens</CardTitle>
              <CardDescription>
                A imagem aparece no card da coleção; o banner, no topo da página dela.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Imagem</Label>
                <ImageUpload
                  bucket="categories"
                  folder="colecoes"
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
                  folder="colecoes-banners"
                  value={bannerUrl}
                  onChange={setBannerUrl}
                  disabled={pending}
                />
              </div>
            </CardContent>
          </Card>

          {productsSlot && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Produtos da coleção</CardTitle>
                <CardDescription>
                  Arraste para definir a ordem que a loja mostra. Salva sozinho.
                </CardDescription>
              </CardHeader>
              <CardContent>{productsSlot}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>Como a coleção aparece no Google.</CardDescription>
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
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Coleção ativa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Inativa some da loja, mas continua aqui no painel.
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  className="shrink-0"
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="show_on_home" className="cursor-pointer">
                    Aparece na home
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ganha um carrossel próprio na página inicial.
                  </p>
                </div>
                <Switch
                  id="show_on_home"
                  checked={showOnHome}
                  onCheckedChange={setShowOnHome}
                  className="shrink-0"
                />
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
            onClick={() => router.push('/admin/colecoes')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Salvando…' : mode === 'create' ? 'Criar coleção' : 'Salvar'}
          </Button>
        </div>
      </div>
    </form>
  )
}
