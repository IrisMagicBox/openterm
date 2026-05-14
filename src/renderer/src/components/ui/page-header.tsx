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
        'app-page-header flex h-[var(--workspace-header-height)] shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-black/[0.045] bg-white/88 py-0',
        dense ? 'px-3.5' : 'px-4',
        drag && 'drag',
        className
      )}
      {...props}
    >
      {drag && <span aria-hidden className="sidebar-toggle-drag-exclusion" />}
      <div className="flex min-w-0 items-center gap-2.5 no-drag">
        {leading}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <h2
            className={cn(
              'shrink-0 truncate font-semibold leading-none text-foreground',
              dense ? 'max-w-[38rem] text-[13px]' : 'text-sm'
            )}
          >
            {title}
          </h2>
          {description && (
            <div
              className={cn(
                'flex min-w-0 items-center gap-1.5 leading-none text-muted-foreground',
                dense ? 'shrink-0 text-[11px]' : 'text-xs'
              )}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 no-drag">{actions}</div>}
    </header>
  )
}
