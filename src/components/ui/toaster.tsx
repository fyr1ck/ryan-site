'use client'

import * as React from 'react'
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

/* O sonner pinta os toasts por CSS variables próprias. Aqui elas apontam
   para os tokens da loja, então o toast segue o tema (e a cor primária que
   o admin troca em runtime) sem nenhum hex hardcoded. */
const sonnerTheme = {
  '--normal-bg': 'hsl(var(--popover))',
  '--normal-text': 'hsl(var(--popover-foreground))',
  '--normal-border': 'hsl(var(--border))',
  '--success-bg': 'hsl(var(--card))',
  '--success-text': 'hsl(var(--success))',
  '--success-border': 'hsl(var(--success) / 0.35)',
  '--error-bg': 'hsl(var(--card))',
  '--error-text': 'hsl(var(--destructive))',
  '--error-border': 'hsl(var(--destructive) / 0.35)',
  '--warning-bg': 'hsl(var(--card))',
  '--warning-text': 'hsl(var(--warning))',
  '--warning-border': 'hsl(var(--warning) / 0.35)',
  '--info-bg': 'hsl(var(--card))',
  '--info-text': 'hsl(var(--primary))',
  '--info-border': 'hsl(var(--primary) / 0.35)',
} as React.CSSProperties

/** Fica no layout raiz. Use `toast(...)` do sonner em qualquer client component. */
function Toaster({ className, style, toastOptions, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-center"
      richColors
      closeButton
      duration={4000}
      gap={10}
      offset={16}
      className={className}
      style={{ ...sonnerTheme, ...style }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: 'rounded-lg border shadow-xl',
          title: 'text-sm font-semibold',
          description: 'text-sm opacity-90',
          actionButton: 'rounded-md text-xs font-semibold',
          cancelButton: 'rounded-md text-xs font-semibold',
          closeButton: 'rounded-md',
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
