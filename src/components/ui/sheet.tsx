'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const overlayAnim =
  'data-[state=open]:animate-[fade-up_200ms_ease-out_both] data-[state=closed]:animate-[fade-up_150ms_ease-in_reverse_both]'
const contentAnim =
  'data-[state=open]:animate-[fade-up_240ms_ease-out_both] data-[state=closed]:animate-[fade-up_180ms_ease-in_reverse_both]'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetPortal = SheetPrimitive.Portal
const SheetClose = SheetPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm', overlayAnim, className)}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  cn(
    'fixed z-50 flex flex-col gap-4 border-border bg-card p-5 shadow-2xl focus:outline-none',
    contentAnim
  ),
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 max-h-[85dvh] overflow-y-auto rounded-b-xl border-b',
        bottom: 'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t',
        left: 'inset-y-0 left-0 h-full w-[86%] max-w-sm overflow-y-auto border-r',
        right: 'inset-y-0 right-0 h-full w-[86%] max-w-sm overflow-y-auto border-l',
      },
    },
    defaultVariants: { side: 'right' },
  }
)

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, hideClose = false, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {!hideClose && (
        <SheetPrimitive.Close
          className={cn(
            'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none'
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Fechar</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8 text-left', className)} {...props} />
}
SheetHeader.displayName = 'SheetHeader'

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-tight text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
