import type { AgentPart } from '../../../shared/types'
import { agentPartPreview, parseAgentPartCommand } from './agent-part-preview'

export type AgentActivityKind = 'explore' | 'edit' | 'command' | 'approval' | 'other'

export interface AgentActivityLine {
  id: string
  kind: AgentActivityKind
  label: string
  detail: string
  status: AgentPart['status']
}

function toolDisplayName(part: AgentPart): string {
  if (part.type === 'permission') return '权限'
  if (part.toolName === 'websearch') return '网页搜索'
  if (part.toolName === 'execute_command') return '命令'
  if (part.toolName === 'read_file') return '文件'
  if (part.toolName === 'write_file' || part.toolName === 'edit') return '文件'
  return part.toolName || part.type
}

function normalizedToolName(part: AgentPart): string {
  return `${part.toolName || ''} ${parseAgentPartCommand(part)}`.toLowerCase()
}

export function agentActivityKind(part: AgentPart): AgentActivityKind {
  if (part.type === 'permission') return 'approval'

  const value = normalizedToolName(part)
  if (
    part.type === 'tool' &&
    /(exec|command|shell|terminal|run|npm|pnpm|yarn|git|python|node)/.test(value)
  ) {
    return 'command'
  }
  if (/(write|edit|patch|apply|create|delete|remove|rename|update|save)/.test(value)) {
    return 'edit'
  }
  if (/(read|list|search|find|open|fetch|inspect|scan|glob|grep|rg|ls)/.test(value)) {
    return 'explore'
  }
  return 'other'
}

export function agentActivityVerb(part: AgentPart): string {
  const kind = agentActivityKind(part)
  if (kind === 'command') return '运行'
  if (kind === 'edit') return '编辑'
  if (kind === 'explore') return '探索'
  if (kind === 'approval') return '确认'
  return '处理'
}

export function agentActivityStatus(parts: AgentPart[]): string {
  if (parts.some((part) => part.status === 'error')) return '有错误'
  if (parts.some((part) => part.status === 'blocked')) return '需确认'
  if (parts.some((part) => part.status === 'running' || part.status === 'pending')) return '处理中'
  if (parts.some((part) => part.status === 'cancelled')) return '已取消'
  return '已处理'
}

export function agentActivitySummary(parts: AgentPart[]): string {
  const visible = parts.filter((part) => part.type !== 'usage')
  if (visible.length === 0) return ''

  const counts = visible.reduce(
    (acc, part) => {
      acc[agentActivityKind(part)] += 1
      return acc
    },
    { explore: 0, edit: 0, command: 0, approval: 0, other: 0 } satisfies Record<
      AgentActivityKind,
      number
    >
  )
  const fragments: string[] = []
  if (counts.explore > 0) fragments.push(`探索 ${counts.explore} 项`)
  if (counts.edit > 0) fragments.push(`编辑 ${counts.edit} 项`)
  if (counts.command > 0) fragments.push(`运行 ${counts.command} 个命令`)
  if (counts.approval > 0) fragments.push(`确认 ${counts.approval} 项`)
  if (counts.other > 0) fragments.push(`处理 ${counts.other} 项`)

  return fragments.join('，')
}

export function agentActivityLines(parts: AgentPart[], limit = 12): AgentActivityLine[] {
  return parts
    .filter((part) => part.type !== 'usage')
    .slice(0, limit)
    .map((part) => {
      const kind = agentActivityKind(part)
      const command = parseAgentPartCommand(part)
      const preview = part.type === 'permission' ? '' : agentPartPreview(part, 120)
      return {
        id: part.id,
        kind,
        label: `${agentActivityVerb(part)} ${toolDisplayName(part)}`,
        detail: command || preview,
        status: part.status
      }
    })
}
