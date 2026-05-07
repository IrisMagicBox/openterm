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
        'app-page-header flex shrink-0 items-center justify-between gap-4 border-b border-black/[0.06] bg-white/88',
        dense
          ? 'h-[var(--workspace-header-height)] px-4 py-0'
          : 'min-h-[var(--workspace-header-height)] px-6 py-3.5',
        drag && 'drag',
        className
      )}
      {...props}
    >
      {drag && <span aria-hidden className="sidebar-toggle-drag-exclusion" />}
      <div className="flex min-w-0 items-center gap-3 no-drag">
        {leading}
        <div className={cn('min-w-0', dense && 'flex items-center gap-2 overflow-hidden')}>
          <h2
            className={cn(
              'truncate font-semibold text-foreground',
              dense ? 'max-w-[38rem] text-sm leading-none' : 'text-lg'
            )}
          >
            {title}
          </h2>
          {description && (
            <div
              className={cn(
                'flex min-w-0 items-center gap-1.5 text-muted-foreground',
                dense ? 'shrink-0 text-xs leading-none' : 'mt-0.5 text-sm'
              )}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 no-drag">{actions}</div>}
    </header>
  )
}
