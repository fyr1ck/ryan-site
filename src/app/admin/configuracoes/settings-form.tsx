'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Lock, Save, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { updateSettingsAction } from '@/actions/settings'
import { ImageUpload } from '@/components/admin/image-upload'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  GROUP_DESCRIPTION,
  GROUP_LABEL,
  GROUP_ORDER,
  IMAGE_KEYS,
  LONG_TEXT_KEYS,
  fallbackLabel,
  hexToHsl,
  hslToHex,
  isValidHsl,
  type SettingField,
} from './settings-fields'

/** Boolean fica boolean; número e texto viram string até a hora de enviar. */
type DraftValue = string | boolean
type Draft = Record<string, DraftValue>

export interface SettingsFormProps {
  fields: SettingField[]
  canWrite: boolean
}

function toDraft(fields: SettingField[]): Draft {
  const draft: Draft = {}
  for (const field of fields) {
    if (field.kind === 'boolean') {
      draft[field.key] = field.value === true
    } else if (field.is_secret) {
      // Segredo sempre começa vazio: em branco = "não mexa nesta chave".
      draft[field.key] = ''
    } else {
      draft[field.key] = field.value === null || field.value === undefined ? '' : String(field.value)
    }
  }
  return draft
}

export function SettingsForm({ fields, canWrite }: SettingsFormProps) {
  const router = useRouter()

  const [draft, setDraft] = React.useState<Draft>(() => toDraft(fields))
  const [baseline, setBaseline] = React.useState<Draft>(() => toDraft(fields))
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({})
  const [pending, setPending] = React.useState(false)

  // Ajuste durante o render (não em efeito): depois de salvar, o router.refresh()
  // traz `fields` novo e o formulário precisa nascer já com o valor gravado.
  const [syncedFrom, setSyncedFrom] = React.useState(fields)
  if (fields !== syncedFrom) {
    setSyncedFrom(fields)
    const next = toDraft(fields)
    setDraft(next)
    setBaseline(next)
  }

  const groups = React.useMemo(() => {
    const known = GROUP_ORDER.filter((group) => fields.some((field) => field.group_name === group))
    const extras = Array.from(new Set(fields.map((field) => field.group_name))).filter(
      (group) => !GROUP_ORDER.includes(group as (typeof GROUP_ORDER)[number])
    )
    return [...known, ...extras]
  }, [fields])

  const changedKeys = React.useMemo(
    () =>
      fields
        .filter((field) => {
          const value = draft[field.key]
          if (field.is_secret) return typeof value === 'string' && value.trim() !== ''
          return value !== baseline[field.key]
        })
        .map((field) => field.key),
    [fields, draft, baseline]
  )

  function patch(key: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || changedKeys.length === 0) return

    const payload: { key: string; value: string | number | boolean }[] = []

    for (const key of changedKeys) {
      const field = fields.find((row) => row.key === key)
      if (!field) continue
      const raw = draft[key]

      if (field.kind === 'boolean') {
        payload.push({ key, value: raw === true })
        continue
      }

      if (field.kind === 'number') {
        const parsed = Number(String(raw).replace(',', '.'))
        if (!Number.isFinite(parsed)) {
          toast.error(`Informe um número válido em "${field.label ?? fallbackLabel(key)}".`)
          return
        }
        payload.push({ key, value: parsed })
        continue
      }

      if (key === 'primary_color' && !isValidHsl(String(raw))) {
        toast.error('A cor primária precisa estar no formato "258 90% 62%".')
        return
      }

      payload.push({ key, value: String(raw) })
    }

    setPending(true)
    try {
      const result = await updateSettingsAction({ values: payload })
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível salvar as configurações.')
        return
      }

      toast.success(
        result.updated === 1 ? '1 configuração salva.' : `${result.updated ?? 0} configurações salvas.`
      )
      setBaseline(draft)
      // Zera os campos de segredo depois de gravar: o valor não fica na tela.
      setDraft((current) => {
        const next = { ...current }
        for (const field of fields) if (field.is_secret) next[field.key] = ''
        return next
      })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  function renderField(field: SettingField) {
    const label = field.label ?? fallbackLabel(field.key)
    const inputId = `setting-${field.key}`
    const value = draft[field.key]

    // ---- booleano -------------------------------------------------------
    if (field.kind === 'boolean') {
      return (
        <label
          key={field.key}
          className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 p-3"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {label}
              {!field.is_public && <Badge variant="warning">Interna</Badge>}
            </span>
            <span className="block font-mono text-[11px] text-muted-foreground">{field.key}</span>
          </span>
          <Switch
            checked={value === true}
            disabled={!canWrite}
            onCheckedChange={(next) => patch(field.key, next)}
            aria-label={label}
          />
        </label>
      )
    }

    // ---- segredo --------------------------------------------------------
    if (field.is_secret) {
      const shown = revealed[field.key] === true
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={inputId} className="flex flex-wrap items-center gap-2">
            <Lock className="size-3.5 text-muted-foreground" />
            {label}
            <Badge variant="warning">Segredo</Badge>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              type={shown ? 'text' : 'password'}
              value={String(value ?? '')}
              disabled={!canWrite}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => patch(field.key, event.target.value)}
              placeholder={field.has_value ? '••••••••  (já configurado)' : 'Nenhum valor gravado'}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={shown ? 'Ocultar o valor digitado' : 'Revelar o valor digitado'}
              onClick={() => setRevealed((current) => ({ ...current, [field.key]: !shown }))}
            >
              {shown ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O valor gravado nunca é carregado nesta tela. Deixe em branco para mantê-lo; digite algo
            para substituí-lo.
          </p>
        </div>
      )
    }

    // ---- imagem ---------------------------------------------------------
    if (IMAGE_KEYS[field.key]) {
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label>{label}</Label>
          <ImageUpload
            bucket="store-assets"
            value={String(value ?? '') || null}
            onChange={(url) => patch(field.key, url ?? '')}
            aspect={IMAGE_KEYS[field.key]}
            disabled={!canWrite}
            hint={`Chave ${field.key}`}
            className="max-w-sm"
          />
        </div>
      )
    }

    // ---- cor primária ---------------------------------------------------
    if (field.key === 'primary_color') {
      const text = String(value ?? '')
      const valid = isValidHsl(text)
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={inputId}>{label}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              type="color"
              value={hslToHex(text)}
              disabled={!canWrite}
              onChange={(event) => {
                const converted = hexToHsl(event.target.value)
                if (converted) patch(field.key, converted)
              }}
              className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Escolher a cor primária"
            />
            <Input
              value={text}
              disabled={!canWrite}
              onChange={(event) => patch(field.key, event.target.value)}
              placeholder="258 90% 62%"
              className={cn('max-w-40 font-mono text-xs', !valid && 'border-destructive')}
              aria-label="Cor primária em HSL"
            />
            <span
              className="h-10 flex-1 rounded-md border border-border"
              style={{ backgroundColor: valid ? `hsl(${text})` : 'transparent' }}
              aria-hidden
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Gravada como &quot;matiz saturação% luminosidade%&quot; — é o formato que a variável CSS
            da loja espera. {!valid && <span className="text-destructive">Formato inválido.</span>}
          </p>
        </div>
      )
    }

    // ---- número ---------------------------------------------------------
    if (field.kind === 'number') {
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={inputId} className="flex flex-wrap items-center gap-2">
            {label}
            {!field.is_public && <Badge variant="warning">Interna</Badge>}
          </Label>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            value={String(value ?? '')}
            disabled={!canWrite}
            onChange={(event) => patch(field.key, event.target.value)}
            className="max-w-40"
          />
          <p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
        </div>
      )
    }

    // ---- texto longo ----------------------------------------------------
    if (LONG_TEXT_KEYS.has(field.key)) {
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={inputId}>{label}</Label>
          <Textarea
            id={inputId}
            value={String(value ?? '')}
            disabled={!canWrite}
            rows={3}
            maxLength={500}
            onChange={(event) => patch(field.key, event.target.value)}
          />
          <p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
        </div>
      )
    }

    // ---- texto ----------------------------------------------------------
    return (
      <div key={field.key} className="grid gap-1.5">
        <Label htmlFor={inputId} className="flex flex-wrap items-center gap-2">
          {label}
          {!field.is_public && <Badge variant="warning">Interna</Badge>}
        </Label>
        <Input
          id={inputId}
          value={String(value ?? '')}
          disabled={!canWrite}
          maxLength={500}
          onChange={(event) => patch(field.key, event.target.value)}
        />
        <p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue={groups[0] ?? 'general'}>
        <TabsList>
          {groups.map((group) => (
            <TabsTrigger key={group} value={group}>
              {GROUP_LABEL[group] ?? fallbackLabel(group)}
            </TabsTrigger>
          ))}
        </TabsList>

        {groups.map((group) => {
          const groupFields = fields.filter((field) => field.group_name === group)
          const hasInternal = groupFields.some((field) => !field.is_public)

          return (
            <TabsContent key={group} value={group}>
              <Card>
                <CardHeader>
                  <CardTitle>{GROUP_LABEL[group] ?? fallbackLabel(group)}</CardTitle>
                  <CardDescription>
                    {GROUP_DESCRIPTION[group] ?? 'Configurações desta área.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {hasInternal && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <p className="text-muted-foreground">
                        As chaves marcadas como{' '}
                        <strong className="text-foreground">Interna</strong> não são enviadas ao
                        navegador dos clientes — elas ficam só no servidor. Trate-as como
                        configuração de operação, não como texto de vitrine.
                      </p>
                    </div>
                  )}

                  {groupFields.map(renderField)}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>

      {canWrite && (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {changedKeys.length === 0
              ? 'Nenhuma alteração pendente.'
              : `${changedKeys.length} alteração(ões) pendente(s).`}
          </p>
          <Button type="submit" disabled={pending || changedKeys.length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      )}
    </form>
  )
}
