import * as React from 'react'
import { cn } from '../../lib/utils'

export function Toolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('flex items-center gap-2', className)} {...props} />
}

export function ToolbarGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-md border border-border bg-surface',
        className
      )}
      {...props}
    />
  )
}
