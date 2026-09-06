import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: React.ReactNode
  /** Ícone do lucide já renderizado, ex.: <Wallet /> */
  icon?: React.ReactNode
  /**
   * Variação percentual do período. `null` quando não há base de comparação —
   * mostrar "+100%" porque o período anterior foi zero engana mais do que ajuda.
   */
  change?: number | null
  /** Texto ao lado da variação, ex.: "vs. 30 dias anteriores". */
  changeLabel?: string
  /** Linha de apoio quando não existe variação. */
  hint?: string
  className?: string
}

function formatChange(change: number): string {
  const value = Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${value}%`
}

export function StatCard({
  label,
  value,
  icon,
  change = null,
  changeLabel,
  hint,
  className,
}: StatCardProps) {
  const hasChange = typeof change === 'number' && Number.isFinite(change)
  const up = hasChange && change > 0
  const down = hasChange && change < 0
  const footnote = hasChange ? changeLabel : hint

  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>

      <p className="mt-3 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>

      {(hasChange || footnote) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {hasChange && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                up && 'text-success',
                down && 'text-destructive',
                !up && !down && 'text-muted-foreground'
              )}
            >
              {up && <ArrowUp className="size-3.5" />}
              {down && <ArrowDown className="size-3.5" />}
              {formatChange(change)}
            </span>
          )}
          {footnote && <span className="text-muted-foreground">{footnote}</span>}
        </div>
      )}
    </Card>
  )
}
