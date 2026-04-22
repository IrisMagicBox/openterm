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
      variant={active ? 'primary' : 'ghost'}
      className={cn(
        'relative h-9 w-full justify-start gap-3 px-3 group',
        active ? 'text-white' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
        !label && 'justify-center px-0'
      )}
    >
      <span
        className={cn(
          'transition-colors',
          active ? 'text-white' : 'text-muted-foreground group-hover:text-accent'
        )}
      >
        {icon}
      </span>
      {label && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {count !== undefined && label && (
        <Badge
          variant={active ? 'accent' : 'neutral'}
          className={active ? 'border-white/20 bg-white/15 text-white' : ''}
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
