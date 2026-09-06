'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/* `delayed-open` é o estado do Radix quando o tooltip abre depois do delay. */
const tooltipAnim = cn(
  'data-[state=instant-open]:animate-[fade-up_120ms_ease-out_both]',
  'data-[state=delayed-open]:animate-[fade-up_120ms_ease-out_both]',
  'data-[state=closed]:animate-[fade-up_100ms_ease-in_reverse_both]'
)

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={12}
      className={cn(
        'z-50 max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5',
        'text-xs font-medium text-popover-foreground shadow-lg',
        tooltipAnim,
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
