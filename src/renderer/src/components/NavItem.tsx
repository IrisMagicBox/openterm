import type { ReactNode } from 'react'
import { Badge, Button, Tooltip } from './ui'
import { cn } from '../lib/utils'

interface NavItemProps {
  active: boolean
  icon: ReactNode
  label: string
  count?: number
  onClick: () => void
  tooltip?: string
}

export function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
  tooltip
}: NavItemProps): React.ReactElement {
  const item = (
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        'group relative h-8 w-full justify-start gap-2.5 rounded-lg border px-2.5 text-[13px] font-semibold',
        active
          ? 'border-black/[0.045] bg-black/[0.055] text-foreground shadow-none'
          : 'border-transparent text-muted-foreground hover:border-black/[0.04] hover:bg-black/[0.035] hover:text-foreground',
        !label && 'justify-center px-0'
      )}
    >
      <span
        className={cn(
          'transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
        )}
      >
        {icon}
      </span>
      {label && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {count !== undefined && label && (
        <Badge
          variant={active ? 'accent' : 'neutral'}
          className={cn(
            'min-h-4 px-1.5 text-[10px]',
            active ? 'border-white/30 bg-white/20 text-muted-foreground' : 'bg-white/[0.12]'
          )}
        >
          {count}
        </Badge>
      )}
      {count !== undefined && !label && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-app bg-danger px-1 text-[11px] font-semibold text-white">
          {count}
        </span>
      )}
    </Button>
  )

  if (!label && tooltip) {
    return (
      <Tooltip content={tooltip} side="right">
        {item}
      </Tooltip>
    )
  }

  return item
}
