import type { AgentPart, AgentPartStatus } from '../../../shared/types'
import { agentActivityKind } from './agent-activity-summary'
import { parseAgentPartCommand, sanitizeAgentText } from './agent-part-preview'

export interface AgentTaskItem {
  id: string
  title: string
  detail?: string
  status: AgentPartStatus
  firstOrder: number
}

function metadataText(part: AgentPart, keys: string[]): string {
  for (const key of keys) {
    const value = part.metadata?.[key]
    if (typeof value === 'string' && value.trim()) return sanitizeAgentText(value)
  }
  return ''
}

function firstLine(value: string): string {
  return sanitizeAgentText(value).split('\n').find(Boolean) || ''
}

function commandLooksLikeCheck(command: string): boolean {
  return /\b(typecheck|tsc|eslint|lint|vitest|test|prettier|diff --check|check)\b/i.test(command)
}

function commandLooksLikeExplore(command: string): boolean {
  return /(^|\s)(rg|grep|find|ls|cat|sed|nl|head|tail|wc|git status|git diff)(\s|$)/i.test(command)
}

function titleForPart(part: AgentPart): { key: string; title: string; detail?: string } {
  const explicitTitle = metadataText(part, ['title', 'name', 'summary', 'label'])
  if (explicitTitle) {
    return {
      key: `step:${explicitTitle.toLowerCase()}`,
      title: explicitTitle,
      detail: firstLine(part.output || part.input || part.error || '')
    }
  }

  const command = parseAgentPartCommand(part)
  if (part.type === 'step' || part.type === 'step_start' || part.type === 'step_finish') {
    const title = firstLine(part.output || part.input || part.error || '') || '推进任务'
    return { key: `step:${title.toLowerCase()}`, title, detail: command }
  }

  if (part.type === 'patch') {
    return { key: 'edit', title: '修改代码', detail: firstLine(part.output || part.input || '') }
  }

  const kind = agentActivityKind(part)
  if (kind === 'edit') return { key: 'edit', title: '修改代码', detail: command }
  if (kind === 'explore' || commandLooksLikeExplore(command)) {
    return { key: 'explore', title: '梳理上下文', detail: command }
  }
  if (kind === 'command' && commandLooksLikeCheck(command)) {
    return { key: 'verify', title: '运行检查', detail: command }
  }
  if (kind === 'command') return { key: 'command', title: '运行命令', detail: command }
  if (kind === 'approval') return { key: 'approval', title: '处理确认', detail: command }
  if (part.type === 'compaction') return { key: 'context', title: '整理上下文' }
  if (part.type === 'subagent') return { key: 'subagent', title: '协调子任务' }
  if (part.type === 'error')
    return { key: 'error', title: '处理错误', detail: firstLine(part.error || '') }
  return {
    key: `part:${part.type}`,
    title: '同步任务状态',
    detail: firstLine(part.output || part.input || part.error || '')
  }
}

function mergeStatus(current: AgentPartStatus, next: AgentPartStatus): AgentPartStatus {
  if (current === 'error' || next === 'error') return 'error'
  if (current === 'blocked' || next === 'blocked') return 'blocked'
  if (current === 'running' || next === 'running') return 'running'
  if (current === 'pending' || next === 'pending') return 'pending'
  if (current === 'cancelled' || next === 'cancelled') return 'cancelled'
  return 'completed'
}

export function deriveAgentTasks(parts: AgentPart[]): AgentTaskItem[] {
  const taskMap = new Map<string, AgentTaskItem>()

  parts
    .filter((part) => part.type !== 'text' && part.type !== 'reasoning' && part.type !== 'usage')
    .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
    .forEach((part) => {
      const descriptor = titleForPart(part)
      const existing = taskMap.get(descriptor.key)
      if (!existing) {
        taskMap.set(descriptor.key, {
          id: descriptor.key,
          title: descriptor.title,
          detail: descriptor.detail,
          status: part.status,
          firstOrder: part.orderIndex
        })
        return
      }

      existing.status = mergeStatus(existing.status, part.status)
      if (descriptor.detail) existing.detail = descriptor.detail
    })

  return [...taskMap.values()].sort((a, b) => a.firstOrder - b.firstOrder)
}
