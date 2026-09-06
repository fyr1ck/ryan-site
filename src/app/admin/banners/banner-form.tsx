'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { createBannerAction, updateBannerAction, type BannerInput } from '@/actions/banners'
import { ImageUpload } from '@/components/admin/image-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Banner, BannerPlacement } from '@/lib/types/database.types'

export const PLACEMENT_LABEL: Record<BannerPlacement, string> = {
  home_hero: 'Topo da home',
  home_middle: 'Meio da home',
  category_top: 'Topo das categorias',
  sidebar: 'Barra lateral',
}

export const PLACEMENT_ORDER: BannerPlacement[] = [
  'home_hero',
  'home_middle',
  'category_top',
  'sidebar',
]

const PLACEMENT_HINT: Record<BannerPlacement, string> = {
  home_hero: 'Aparece no carrossel principal da página inicial.',
  home_middle: 'Faixa entre as seções da página inicial.',
  category_top: 'Faixa acima da lista de produtos das categorias.',
  sidebar: 'Espaço lateral em telas grandes.',
}

/**
 * timestamptz ⇄ <input type="datetime-local">.
 *
 * A conversão acontece AQUI, no navegador, porque só o navegador conhece o fuso
 * de quem está agendando. Feita no servidor, uma promoção marcada para as 00h
 * de São Paulo entraria no ar às 21h do dia anterior.
 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export interface BannerFormProps {
  /** undefined = criação. */
  banner?: Banner
}

export function BannerForm({ banner }: BannerFormProps) {
  const router = useRouter()
  const editing = Boolean(banner)

  const [title, setTitle] = React.useState(banner?.title ?? '')
  const [placement, setPlacement] = React.useState<BannerPlacement>(banner?.placement ?? 'home_hero')
  const [imageUrl, setImageUrl] = React.useState<string | null>(banner?.image_url ?? null)
  const [imageMobileUrl, setImageMobileUrl] = React.useState<string | null>(
    banner?.image_mobile_url ?? null
  )
  const [alt, setAlt] = React.useState(banner?.alt ?? '')
  const [linkUrl, setLinkUrl] = React.useState(banner?.link_url ?? '')
  const [openInNewTab, setOpenInNewTab] = React.useState(banner?.open_in_new_tab ?? false)
  const [startsAt, setStartsAt] = React.useState(toLocalInput(banner?.starts_at))
  const [endsAt, setEndsAt] = React.useState(toLocalInput(banner?.ends_at))
  const [isActive, setIsActive] = React.useState(banner?.is_active ?? true)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (!imageUrl) {
      toast.error('Envie a imagem de desktop antes de salvar.')
      return
    }

    const payload: BannerInput = {
      title,
      placement,
      image_url: imageUrl,
      image_mobile_url: imageMobileUrl,
      alt,
      link_url: linkUrl,
      open_in_new_tab: openInNewTab,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      is_active: isActive,
    }

    setPending(true)
    try {
      const result = banner
        ? await updateBannerAction({ ...payload, id: banner.id })
        : await createBannerAction(payload)

      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar o banner.')
        return
      }

      toast.success(editing ? 'Banner atualizado.' : 'Banner criado.')
      router.push('/admin/banners')
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
            <CardDescription>Como o banner aparece e para onde ele leva.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="banner-title">Título</Label>
              <Input
                id="banner-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Promoção de Robux"
                maxLength={120}
                required
              />
              <p className="text-xs text-muted-foreground">
                Uso interno: ajuda a achar o banner nesta lista.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="banner-placement">Posicionamento</Label>
              <Select
                value={placement}
                onValueChange={(value) => setPlacement(value as BannerPlacement)}
              >
                <SelectTrigger id="banner-placement">
                  <SelectValue placeholder="Escolha onde exibir" />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENT_ORDER.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PLACEMENT_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PLACEMENT_HINT[placement]}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="banner-alt">Texto alternativo</Label>
              <Input
                id="banner-alt"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                placeholder="Robux com 20% de desconto até domingo"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Descreve a arte para leitores de tela e para quando a imagem não carrega.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="banner-link">Link</Label>
              <Input
                id="banner-link"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="/categoria/robux"
                maxLength={2048}
              />
              <p className="text-xs text-muted-foreground">
                Caminho interno começando com &quot;/&quot; ou endereço http(s). Deixe vazio para um
                banner sem clique.
              </p>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 p-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Abrir em nova aba</span>
                <span className="block text-xs text-muted-foreground">
                  Recomendado só para links que saem da loja.
                </span>
              </span>
              <Switch
                checked={openInNewTab}
                onCheckedChange={setOpenInNewTab}
                aria-label="Abrir o link em nova aba"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imagens</CardTitle>
            <CardDescription>Arte de desktop obrigatória; a de celular é opcional.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Imagem desktop</Label>
              <ImageUpload
                bucket="banners"
                value={imageUrl}
                onChange={setImageUrl}
                aspect="video"
                folder="desktop"
                hint="Formato largo, tipo 1600×600."
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Imagem mobile (opcional)</Label>
              <ImageUpload
                bucket="banners"
                value={imageMobileUrl}
                onChange={setImageMobileUrl}
                aspect="square"
                folder="mobile"
                hint="Se ficar vazia, o celular usa a imagem de desktop."
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Exibição</CardTitle>
            <CardDescription>Quando o banner entra e sai do ar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Ativo</span>
                <span className="block text-xs text-muted-foreground">
                  Desligado, some da loja mesmo dentro da janela de datas.
                </span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Banner ativo" />
            </label>

            <div className="grid gap-1.5">
              <Label htmlFor="banner-starts">Início (opcional)</Label>
              <Input
                id="banner-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="banner-ends">Fim (opcional)</Label>
              <Input
                id="banner-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sem datas, o banner fica no ar enquanto estiver ativo. As horas seguem o fuso deste
                computador.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar banner'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => router.push('/admin/banners')}
          >
            <ArrowLeft />
            Voltar para a lista
          </Button>
        </div>
      </div>
    </form>
  )
}
