import type { AgentPart } from '../../../shared/types'
import { parseAgentPartCommand, sanitizeAgentText } from './agent-part-preview'

export function permissionPartsByParent(parts: AgentPart[]): Map<string, AgentPart[]> {
  const result = new Map<string, AgentPart[]>()
  for (const part of parts) {
    if (part.type !== 'permission' || !part.parentPartId) continue
    const current = result.get(part.parentPartId) ?? []
    current.push(part)
    result.set(part.parentPartId, current)
  }

  for (const permissions of result.values()) {
    permissions.sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
  }
  return result
}

export function permissionStatusLabel(part: AgentPart): string {
  if (part.status === 'blocked' || part.status === 'pending' || part.status === 'running') {
    return '等待确认'
  }
  if (part.status === 'completed') return '已确认'
  if (part.status === 'error') return '已拒绝'
  if (part.status === 'cancelled') return '已取消'
  return '权限'
}

export function permissionTooltipText(part: AgentPart): string {
  const permission =
    typeof part.metadata?.permission === 'string' ? sanitizeAgentText(part.metadata.permission) : ''
  const riskLevel =
    typeof part.metadata?.riskLevel === 'string' ? sanitizeAgentText(part.metadata.riskLevel) : ''
  const scope = typeof part.metadata?.scope === 'string' ? sanitizeAgentText(part.metadata.scope) : ''
  const reason =
    typeof part.metadata?.reason === 'string'
      ? sanitizeAgentText(part.metadata.reason)
      : parseAgentPartCommand(part)

  return [
    `权限：${permission || '操作确认'}`,
    `状态：${permissionStatusLabel(part)}`,
    riskLevel ? `风险：${riskLevel}` : '',
    scope ? `范围：${scope === 'topic' ? '本会话' : scope === 'turn' ? '本轮' : '本次'}` : '',
    reason ? `原因：${reason}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
