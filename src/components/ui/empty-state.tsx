import * as React from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps extends React.ComponentProps<'div'> {
  /** Ícone do lucide-react já renderizado, ex.: <PackageOpen /> */
  icon?: React.ReactNode
  title: string
  description?: string
  /** Botão ou link de saída — "Ver todos os produtos", "Limpar filtros". */
  action?: React.ReactNode
}

/** Estado vazio de listas: carrinho, pedidos, busca sem resultado. */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border',
        'bg-card/40 px-6 py-12 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export { EmptyState }
