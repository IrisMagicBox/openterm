import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import type { AgentPart } from '../../../shared/types'
import { Tooltip } from './ui'
import { cn } from '../lib/utils'
import { permissionStatusLabel, permissionTooltipText } from '../lib/agent-permission-parts'

interface AgentPermissionBadgeProps {
  permissions?: AgentPart[]
}

function latestPermission(parts: AgentPart[]): AgentPart | undefined {
  return [...parts].sort((a, b) => b.orderIndex - a.orderIndex || b.updatedAt - a.updatedAt)[0]
}

export function AgentPermissionBadge({
  permissions
}: AgentPermissionBadgeProps): React.ReactElement | null {
  if (!permissions || permissions.length === 0) return null

  const latest = latestPermission(permissions)
  if (!latest) return null

  const hasBlocked = permissions.some((part) =>
    ['blocked', 'pending', 'running'].includes(part.status)
  )
  const hasError = permissions.some((part) => part.status === 'error')
  const Icon = hasBlocked ? ShieldQuestion : hasError ? ShieldAlert : ShieldCheck
  const countLabel = permissions.length > 1 ? ` ${permissions.length}` : ''
  const tooltip = permissions.map(permissionTooltipText).join('\n\n')

  return (
    <Tooltip
      side="top"
      content={
        <span className="block max-w-[360px] whitespace-pre-wrap font-normal leading-5">
          {tooltip}
        </span>
      }
    >
      <span
        className={cn(
          'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium',
          hasBlocked
            ? 'border-warning/25 bg-warning-soft text-warning'
            : hasError
              ? 'border-danger/25 bg-danger-soft text-danger'
              : 'border-success/25 bg-success-soft text-success'
        )}
        aria-label={`${permissionStatusLabel(latest)}${countLabel}`}
      >
        <Icon size={12} strokeWidth={2.1} />
        <span className="leading-none">权限{countLabel}</span>
      </span>
    </Tooltip>
  )
}
