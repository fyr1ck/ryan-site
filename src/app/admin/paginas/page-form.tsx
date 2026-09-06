'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { createPageAction, updatePageAction, type PageInput } from '@/actions/pages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { slugify } from '@/lib/utils'
import type { Page } from '@/lib/types/database.types'

export interface PageFormProps {
  /** undefined = criação. */
  page?: Page
}

export function PageForm({ page }: PageFormProps) {
  const router = useRouter()
  const editing = Boolean(page)

  const [title, setTitle] = React.useState(page?.title ?? '')
  const [slug, setSlug] = React.useState(page?.slug ?? '')
  const [content, setContent] = React.useState(page?.content ?? '')
  const [excerpt, setExcerpt] = React.useState(page?.excerpt ?? '')
  const [seoTitle, setSeoTitle] = React.useState(page?.seo_title ?? '')
  const [seoDescription, setSeoDescription] = React.useState(page?.seo_description ?? '')
  const [isPublished, setIsPublished] = React.useState(page?.is_published ?? false)
  const [showInFooter, setShowInFooter] = React.useState(page?.show_in_footer ?? false)
  const [position, setPosition] = React.useState(page?.position ?? 0)
  const [pending, setPending] = React.useState(false)

  /**
   * O slug acompanha o título só enquanto ninguém mexeu nele à mão, e nunca
   * numa página que já existe: mudar o endereço de uma página publicada quebra
   * links que já estão no rodapé, no checkout e nos e-mails.
   */
  const slugTouched = React.useRef(editing)

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!slugTouched.current) setSlug(slugify(value))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const payload: PageInput = {
      title,
      slug,
      content,
      excerpt,
      seo_title: seoTitle,
      seo_description: seoDescription,
      is_published: isPublished,
      show_in_footer: showInFooter,
      position,
    }

    setPending(true)
    try {
      const result = page
        ? await updatePageAction({ ...payload, id: page.id })
        : await createPageAction(payload)

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar a página.')
        return
      }

      toast.success(editing ? 'Página atualizada.' : 'Página criada.')
      router.push('/admin/paginas')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Conteúdo</CardTitle>
            <CardDescription>O que a pessoa lê ao abrir a página.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="page-title">Título</Label>
              <Input
                id="page-title"
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Termos de uso"
                maxLength={160}
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="page-slug">Endereço</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">/pagina/</span>
                <Input
                  id="page-slug"
                  value={slug}
                  onChange={(event) => {
                    slugTouched.current = true
                    setSlug(event.target.value)
                  }}
                  onBlur={(event) => setSlug(slugify(event.target.value))}
                  placeholder="termos-de-uso"
                  maxLength={120}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Só letras, números e hífen. {editing && 'Mudar isto quebra os links já publicados.'}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="page-content">Conteúdo (HTML)</Label>
              <Textarea
                id="page-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={18}
                className="font-mono text-xs"
                placeholder="<h2>Título da seção</h2>&#10;<p>Texto…</p>"
              />
              <p className="text-xs text-muted-foreground">
                Aceita formatação (títulos, listas, links, tabelas). Tags como script, style e iframe
                são removidas ao salvar.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="page-excerpt">Resumo</Label>
              <Textarea
                id="page-excerpt"
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Uma ou duas linhas explicando a página."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
            <CardDescription>
              Como a página aparece no Google. Em branco, o título e o resumo acima são usados.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="page-seo-title">Título SEO</Label>
              <Input
                id="page-seo-title"
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                maxLength={70}
                placeholder="Termos de uso · Roblox Store"
              />
              <p className="text-xs text-muted-foreground">{seoTitle.length}/70</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="page-seo-description">Descrição SEO</Label>
              <Textarea
                id="page-seo-description"
                value={seoDescription}
                onChange={(event) => setSeoDescription(event.target.value)}
                rows={3}
                maxLength={180}
                placeholder="Regras de uso, prazos de entrega e política de reembolso da loja."
              />
              <p className="text-xs text-muted-foreground">{seoDescription.length}/180</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Publicação</CardTitle>
            <CardDescription>Quem enxerga a página e onde ela é linkada.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Publicada</span>
                <span className="block text-xs text-muted-foreground">
                  Em rascunho, só quem tem acesso ao painel vê.
                </span>
              </span>
              <Switch
                checked={isPublished}
                onCheckedChange={setIsPublished}
                aria-label="Página publicada"
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Mostrar no rodapé</span>
                <span className="block text-xs text-muted-foreground">
                  Entra na lista de links do rodapé da loja.
                </span>
              </span>
              <Switch
                checked={showInFooter}
                onCheckedChange={setShowInFooter}
                aria-label="Mostrar no rodapé"
              />
            </label>

            <div className="grid gap-1.5">
              <Label htmlFor="page-position">Posição no rodapé</Label>
              <Input
                id="page-position"
                type="number"
                min={0}
                max={9999}
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
                className="max-w-28"
              />
              <p className="text-xs text-muted-foreground">Menor número aparece primeiro.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar página'}
          </Button>

          {editing && page && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/pagina/${page.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Ver a página
              </Link>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={() => router.push('/admin/paginas')}
          >
            <ArrowLeft />
            Voltar para a lista
          </Button>
        </div>
      </div>
    </form>
  )
}
