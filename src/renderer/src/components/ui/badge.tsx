/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

export const badgeVariants = cva(
  'inline-flex min-h-5 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-surface-muted text-muted-foreground',
        accent: 'border-accent/20 bg-accent-soft text-accent',
        success: 'border-success/20 bg-success-soft text-success',
        warning: 'border-warning/20 bg-warning-soft text-warning',
        danger: 'border-danger/20 bg-danger-soft text-danger'
      }
    },
    defaultVariants: {
      variant: 'neutral'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}
