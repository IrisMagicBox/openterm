import type { AgentPart, AgentPartStatus } from '../../../shared/types'
import { sanitizeAgentText } from './agent-part-preview'

export interface AgentTaskItem {
  id: string
  title: string
  detail?: string
  status: AgentPartStatus
  firstOrder: number
  explicit?: boolean
}

function metadataText(part: AgentPart, keys: string[]): string {
  for (const key of keys) {
    const value = part.metadata?.[key]
    if (typeof value === 'string' && value.trim()) return sanitizeAgentText(value)
  }
  return ''
}

function normalizePlanStatus(value: unknown): AgentPartStatus | undefined {
  if (value === 'completed') return 'completed'
  if (value === 'in_progress') return 'running'
  if (value === 'pending') return 'pending'
  return undefined
}

function explicitPlanItems(part: AgentPart): AgentTaskItem[] {
  const rawItems = part.metadata?.planItems
  if (!Array.isArray(rawItems)) return []

  return rawItems
    .map((item, index): AgentTaskItem | undefined => {
      if (!item || typeof item !== 'object') return undefined
      const record = item as Record<string, unknown>
      const title = typeof record.step === 'string' ? sanitizeAgentText(record.step) : ''
      const status = normalizePlanStatus(record.status)
      if (!title || !status) return undefined
      return {
        id: `plan:${index}:${title.toLowerCase()}`,
        title,
        detail: metadataText(part, ['explanation']),
        status,
        firstOrder: part.orderIndex + index / 100,
        explicit: true
      }
    })
    .filter((item): item is AgentTaskItem => item !== undefined)
}

export function deriveAgentTasks(parts: AgentPart[]): AgentTaskItem[] {
  const latestExplicitPlan = parts
    .filter((part) => part.metadata?.planTool === true || part.toolName === 'update_plan')
    .sort((a, b) => b.orderIndex - a.orderIndex || b.createdAt - a.createdAt)
    .find((part) => explicitPlanItems(part).length > 0)

  if (latestExplicitPlan) {
    return explicitPlanItems(latestExplicitPlan)
  }
  return []
}
