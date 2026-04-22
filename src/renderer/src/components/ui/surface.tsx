/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

export const surfaceVariants = cva('rounded-lg border', {
  variants: {
    variant: {
      plain: 'border-transparent bg-transparent',
      subtle: 'border-border bg-surface-muted',
      raised: 'border-border bg-surface shadow-sm',
      workspace: 'border-workspace-border bg-workspace text-workspace-foreground'
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5'
    }
  },
  defaultVariants: {
    variant: 'raised',
    padding: 'md'
  }
})

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div ref={ref} className={cn(surfaceVariants({ variant, padding, className }))} {...props} />
  )
)
Surface.displayName = 'Surface'
