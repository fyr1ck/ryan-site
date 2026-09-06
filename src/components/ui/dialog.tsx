'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Entrada/saída usam o keyframe `fade-up` que já existe no globals.css.
   Nada de tailwindcss-animate: o Radix precisa de uma animation de verdade
   (ele escuta animationend) para segurar o unmount no fechamento. */
const overlayAnim =
  'data-[state=open]:animate-[fade-up_200ms_ease-out_both] data-[state=closed]:animate-[fade-up_150ms_ease-in_reverse_both]'
const contentAnim =
  'data-[state=open]:animate-[fade-up_220ms_ease-out_both] data-[state=closed]:animate-[fade-up_150ms_ease-in_reverse_both]'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm', overlayAnim, className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Esconde o X do canto quando o fechamento é só pelos botões do rodapé. */
  hideClose?: boolean
}

/* No mobile o conteúdo encosta no rodapé da tela (bottom sheet), no desktop
   centraliza. O wrapper flex evita `translate` no Content — assim a animação
   não briga com o transform de centralização. */
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-center sm:p-4">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'relative w-full max-w-lg rounded-t-xl border border-border bg-card p-5 shadow-2xl',
          'focus:outline-none sm:rounded-xl',
          contentAnim,
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md',
              'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none'
            )}
          >
            <X className="size-4" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-1.5 pr-8 text-left', className)} {...props} />
}
DialogHeader.displayName = 'DialogHeader'

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-tight text-foreground', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
