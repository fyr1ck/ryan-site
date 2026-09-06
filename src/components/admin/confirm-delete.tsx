'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ConfirmDeleteProps {
  /** Ação real. Se lançar, o diálogo continua aberto e o erro vira toast. */
  onConfirm: () => void | Promise<void>
  title?: string
  description?: string
  /** Botão que abre o diálogo. */
  trigger: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmDelete({
  onConfirm,
  title = 'Excluir definitivamente?',
  description = 'Esta ação não pode ser desfeita.',
  trigger,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
}: ConfirmDeleteProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function handleConfirm(event: React.MouseEvent<HTMLButtonElement>) {
    // O AlertDialogAction fecha sozinho no clique; aqui o diálogo só some
    // depois que a exclusão terminar de verdade.
    event.preventDefault()
    if (pending) return

    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a ação.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Excluindo…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
