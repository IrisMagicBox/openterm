import * as React from 'react'
import { cn } from '../../lib/utils'

interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  actions?: React.ReactNode
  dense?: boolean
  drag?: boolean
}

export function PageHeader({
  title,
  description,
  leading,
  actions,
  dense = false,
  drag = true,
  className,
  ...props
}: PageHeaderProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center justify-between gap-4 border-b border-border bg-app/90 backdrop-blur',
        dense ? 'px-5 py-3' : 'px-6 py-4',
        drag && 'drag',
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-3 no-drag">
        {leading}
        <div className="min-w-0">
          <h2 className={cn('truncate font-bold text-foreground', dense ? 'text-base' : 'text-xl')}>
            {title}
          </h2>
          {description && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 no-drag">{actions}</div>}
    </header>
  )
}
