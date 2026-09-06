'use client'

import * as React from 'react'
import NextImage from 'next/image'
import { ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * Tipos aceitos e a extensão que vamos gravar. O nome original do arquivo NUNCA
 * é usado: ele pode trazer acento, espaço, `../` e ainda vaza informação
 * ("orcamento-cliente-x.png"). O bucket também limita isso no servidor — aqui é
 * só para o usuário descobrir o problema antes de subir 5 MB à toa.
 */
const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT_ATTR = Object.keys(ACCEPTED_TYPES).join(',')

export interface ImageUploadProps {
  /** Bucket do Supabase Storage: product-images, banners, categories, store-assets. */
  bucket: string
  value: string | null
  onChange: (url: string | null) => void
  aspect?: 'video' | 'square'
  /** Subpasta opcional dentro do bucket. */
  folder?: string
  /** Texto de apoio abaixo da área de upload. */
  hint?: string
  disabled?: boolean
  className?: string
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

function storageErrorMessage(responseText: string, status: number): string {
  try {
    const parsed = JSON.parse(responseText) as { message?: string; error?: string }
    if (parsed.message) return parsed.message
    if (parsed.error) return parsed.error
  } catch {
    // resposta não-JSON: cai nos genéricos abaixo
  }
  if (status === 401 || status === 403) return 'Você não tem permissão para enviar imagens.'
  if (status === 413) return 'A imagem é grande demais para este bucket.'
  return 'Não foi possível enviar a imagem. Tente de novo.'
}

/**
 * O supabase-js não expõe progresso de upload, então falamos direto com a API
 * de Storage por XHR — mesmo endpoint, mesmo token do usuário, mesmo RLS.
 */
function uploadWithProgress(params: {
  url: string
  token: string
  apiKey: string
  file: File
  fileName: string
  onProgress: (percent: number) => void
}): Promise<void> {
  const { url, token, apiKey, file, fileName, onProgress } = params

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', apiKey)
    xhr.setRequestHeader('x-upsert', 'false')

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(storageErrorMessage(xhr.responseText, xhr.status)))
    }
    xhr.onerror = () => reject(new Error('Falha de rede ao enviar a imagem.'))
    xhr.onabort = () => reject(new Error('Envio cancelado.'))

    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file, fileName)
    xhr.send(body)
  })
}

export function ImageUpload({
  bucket,
  value,
  onChange,
  aspect = 'video',
  folder,
  hint,
  disabled = false,
  className,
}: ImageUploadProps) {
  const supabase = React.useMemo(() => createClient(), [])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const uploading = progress !== null
  const busy = uploading || disabled

  async function handleFile(file: File) {
    const extension = ACCEPTED_TYPES[file.type]
    if (!extension) {
      toast.error('Formato não aceito. Envie JPG, PNG, WebP, AVIF ou GIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`A imagem tem ${formatMegabytes(file.size)}. O limite é 5 MB.`)
      return
    }

    const prefix = folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : ''
    const path = `${prefix}${crypto.randomUUID()}.${extension}`

    setProgress(0)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Sua sessão expirou. Entre de novo para enviar imagens.')
      }

      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!baseUrl || !apiKey) {
        throw new Error('Storage não configurado neste ambiente.')
      }

      await uploadWithProgress({
        url: `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/${bucket}/${path}`,
        token: session.access_token,
        apiKey,
        file,
        fileName: path,
        onProgress: setProgress,
      })

      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      onChange(data.publicUrl)
      toast.success('Imagem enviada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function openPicker() {
    if (busy) return
    inputRef.current?.click()
  }

  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-video'

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />

      {value ? (
        <div className={cn('relative overflow-hidden rounded-xl border border-border bg-muted', aspectClass)}>
          <NextImage
            src={value}
            alt="Pré-visualização da imagem"
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-background/90 to-transparent p-2">
            <Button type="button" variant="secondary" size="sm" onClick={openPicker} disabled={busy}>
              {uploading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Trocar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              <Trash2 />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          onDragOver={(event) => {
            event.preventDefault()
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (busy) return
            const file = event.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors',
            aspectClass,
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40 hover:border-primary/50',
            busy && 'pointer-events-none opacity-60'
          )}
        >
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : dragging ? (
              <UploadCloud className="size-5" />
            ) : (
              <ImagePlus className="size-5" />
            )}
          </span>
          <span className="text-sm font-medium">
            {uploading ? 'Enviando…' : 'Enviar imagem'}
          </span>
          <span className="text-xs text-muted-foreground">
            Arraste aqui ou clique. JPG, PNG, WebP, AVIF ou GIF até 5 MB.
          </span>
        </button>
      )}

      {uploading && (
        <div className="space-y-1">
          <Progress value={progress ?? 0} aria-label="Progresso do envio" />
          <p className="text-right text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}

      {hint && !uploading && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
