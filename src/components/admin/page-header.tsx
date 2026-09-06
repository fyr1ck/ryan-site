import * as React from 'react'

import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  description?: string
  /** Ações da página (botões, filtros) — alinhadas à direita no desktop. */
  children?: React.ReactNode
  className?: string
}

/** Cabeçalho padrão de toda tela do painel. */
export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>

      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:min-w-0">{children}</div>
      )}
    </div>
  )
}
