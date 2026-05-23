import type { AgentPart } from '../../../shared/types'
import {
  agentPartOutput,
  agentPartPreview,
  parseAgentPartCommand,
  sanitizeAgentText
} from './agent-part-preview'

export type AgentActivityKind =
  | 'think'
  | 'plan'
  | 'explore'
  | 'edit'
  | 'command'
  | 'approval'
  | 'other'

export interface AgentActivityLine {
  id: string
  kind: AgentActivityKind
  label: string
  detail: string
  fullDetail: string
  sections: AgentActivityDetailSection[]
  status: AgentPart['status']
}

export interface AgentActivityDetailSection {
  id: string
  label: string
  content: string
  tone: 'observation' | 'call' | 'result' | 'error'
  defaultOpen?: boolean
}

const INLINE_DETAIL_EXPAND_THRESHOLD = 80

function toolDisplayName(part: AgentPart): string {
  if (part.type === 'text' || part.type === 'reasoning') return '思考'
  if (part.toolName === 'update_plan' || part.metadata?.planTool === true) return '任务规划'
  if (part.type === 'permission') return '权限'
  if (part.toolName === 'websearch') return '网页搜索'
  if (part.toolName === 'execute_command') return '命令'
  if (part.toolName === 'read_file') return '文件'
  if (part.toolName === 'write_file' || part.toolName === 'edit') return '文件'
  return part.toolName || part.type
}

function parsePartInput(part: AgentPart): Record<string, unknown> {
  try {
    return JSON.parse(part.input || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseJsonValue(value: string | undefined): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compactJsonValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return ''
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function fullPartDetail(part: AgentPart): string {
  const command = parseAgentPartCommand(part)
  const output = agentPartOutput(part)
  const liveOutputPreview = sanitizeAgentText(textValue(part.metadata?.liveOutputPreview))
  const input = prettyInput(part)
  if (part.type === 'text' || part.type === 'reasoning') return output || input
  return output || liveOutputPreview || command || input
}

function prettyInput(part: AgentPart): string {
  const raw = sanitizeAgentText(part.input || '')
  const parsed = parseJsonValue(part.input)
  if (parsed && typeof parsed === 'object') {
    if (!Array.isArray(parsed) && Object.keys(parsed).length === 0) return ''
    try {
      return JSON.stringify(parsed, null, 2)
    } catch {
      return raw
    }
  }
  return raw
}

function detailSections(part: AgentPart): AgentActivityDetailSection[] {
  const sections: AgentActivityDetailSection[] = []
  const input = prettyInput(part)
  const output = agentPartOutput(part)
  const liveOutputPreview = sanitizeAgentText(textValue(part.metadata?.liveOutputPreview))
  const error = sanitizeAgentText(part.error || '')

  if (part.type === 'text' || part.type === 'reasoning') {
    const observation = output || input
    if (observation) {
      sections.push({
        id: `${part.id}:observation`,
        label: '自我观察',
        content: observation,
        tone: 'observation',
        defaultOpen: true
      })
    }
    return sections
  }

  if (part.type === 'permission') {
    if (part.status !== 'blocked' && part.status !== 'error') return sections

    const reason = sanitizeAgentText(textValue(part.metadata?.reason) || input)
    if (reason) {
      sections.push({
        id: `${part.id}:permission`,
        label: '权限观察',
        content: reason,
        tone: 'error',
        defaultOpen: true
      })
    }
    return sections
  }

  if (input) {
    sections.push({
      id: `${part.id}:call`,
      label: '工具调用',
      content: input,
      tone: 'call'
    })
  }

  const result = output || liveOutputPreview
  if (result) {
    sections.push({
      id: `${part.id}:result`,
      label: '工具结果',
      content: result,
      tone: 'result',
      defaultOpen: part.status === 'completed' || part.status === 'running'
    })
  }

  if (error && error !== result) {
    sections.push({
      id: `${part.id}:error`,
      label: '错误',
      content: error,
      tone: 'error',
      defaultOpen: true
    })
  }

  return sections
}

function toolLine(
  part: AgentPart
): { label: string; detail: string; fullDetail: string } | undefined {
  const input = parsePartInput(part)
  const command = parseAgentPartCommand(part)

  if (part.type === 'permission') {
    const reason = textValue(part.metadata?.reason)
    const permission = textValue(part.metadata?.permission)
    const detail = reason || command || permission
    return {
      label: part.status === 'blocked' ? '等待确认' : '确认权限',
      detail,
      fullDetail: detail
    }
  }

  if (part.toolName === 'websearch') {
    const detail = textValue(input.query) || command
    return { label: '搜索网页', detail, fullDetail: detail }
  }

  if (part.toolName === 'execute_command') {
    const detail = textValue(input.command) || command
    return { label: '运行命令', detail, fullDetail: fullPartDetail(part) || detail }
  }

  if (part.toolName === 'read_notes') {
    const target = textValue(input.target)
    const targetId = textValue(input.targetId)
    const detail = [target === 'host' ? '主机' : target, targetId].filter(Boolean).join(' ')
    return {
      label: '读取备注',
      detail,
      fullDetail: detail
    }
  }

  if (part.toolName === 'write_notes') {
    const target = textValue(input.target)
    const targetId = textValue(input.targetId)
    const detail = [target === 'host' ? '主机' : target, targetId].filter(Boolean).join(' ')
    return {
      label: '更新备注',
      detail,
      fullDetail: detail
    }
  }

  if (part.toolName === 'read_file') {
    const detail = textValue(input.path) || command
    return { label: '读取文件', detail, fullDetail: detail }
  }

  if (part.toolName === 'write_file' || part.toolName === 'edit') {
    const detail = textValue(input.path) || command
    return { label: '编辑文件', detail, fullDetail: detail }
  }

  if (part.toolName === 'list_hosts') return { label: '查看主机', detail: '', fullDetail: '' }
  if (part.toolName === 'list_terminals') return { label: '查看终端', detail: '', fullDetail: '' }
  if (part.toolName === 'search_memory') {
    const detail = textValue(input.query) || command
    return { label: '搜索记忆', detail, fullDetail: detail }
  }
  if (part.toolName === 'search_topics') {
    const detail = textValue(input.query) || command
    return { label: '搜索话题', detail, fullDetail: detail }
  }
  if (part.toolName === 'manage_port_forward') {
    const detail = textValue(input.action) || command
    return { label: '管理端口转发', detail, fullDetail: detail }
  }
  if (part.toolName === 'manage_terminal') {
    const detail = textValue(input.action) || command
    return { label: '管理终端', detail, fullDetail: detail }
  }
  if (part.toolName === 'observe_terminal') {
    const detail = textValue(input.sessionId) || command
    return { label: '观察终端', detail, fullDetail: detail }
  }
  if (part.toolName === 'start_interactive_command') {
    const detail = textValue(input.command) || command
    return { label: '启动交互命令', detail, fullDetail: detail }
  }
  if (part.toolName === 'interact_terminal') {
    const detail = textValue(input.text) || compactJsonValue(input.keys) || command
    return { label: '操作终端', detail, fullDetail: detail }
  }
  if (part.toolName === 'wait_terminal_activity' || part.toolName === 'wait_terminal_text') {
    const detail = textValue(input.sessionId) || command
    return { label: '等待终端', detail, fullDetail: detail }
  }
  if (part.toolName === 'send_terminal_keys') {
    const detail = textValue(input.text) || compactJsonValue(input.keys)
    return { label: '发送按键', detail, fullDetail: detail }
  }

  return undefined
}

function normalizedToolName(part: AgentPart): string {
  return `${part.toolName || ''} ${parseAgentPartCommand(part)}`.toLowerCase()
}

export function agentActivityKind(part: AgentPart): AgentActivityKind {
  if (part.type === 'text' || part.type === 'reasoning') return 'think'
  if (part.toolName === 'update_plan' || part.metadata?.planTool === true) return 'plan'
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
  if (kind === 'think') return '观察'
  if (kind === 'plan') return '规划'
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
    { think: 0, plan: 0, explore: 0, edit: 0, command: 0, approval: 0, other: 0 } satisfies Record<
      AgentActivityKind,
      number
    >
  )
  const fragments: string[] = []
  if (counts.think > 0) fragments.push(`观察 ${counts.think} 次`)
  if (counts.plan > 0) fragments.push(`规划 ${counts.plan} 次`)
  if (counts.explore > 0) fragments.push(`探索 ${counts.explore} 项`)
  if (counts.edit > 0) fragments.push(`编辑 ${counts.edit} 项`)
  if (counts.command > 0) fragments.push(`运行 ${counts.command} 个命令`)
  if (counts.approval > 0) fragments.push(`确认 ${counts.approval} 项`)
  if (counts.other > 0) fragments.push(`处理 ${counts.other} 项`)

  return fragments.join('，')
}

export function agentActivityLines(
  parts: AgentPart[],
  limit = Number.POSITIVE_INFINITY
): AgentActivityLine[] {
  return parts
    .filter((part) => part.type !== 'usage')
    .slice(0, limit)
    .map((part) => {
      const kind = agentActivityKind(part)
      const command = parseAgentPartCommand(part)
      const preview = part.type === 'permission' ? '' : agentPartPreview(part, 120)
      const fullDetail = fullPartDetail(part)
      const readable = toolLine(part)
      const detail = readable?.detail || command || preview
      const sections = detailSections(part)
      return {
        id: part.id,
        kind,
        label:
          readable?.label ||
          (kind === 'think'
            ? '观察'
            : kind === 'plan'
              ? '更新规划'
              : `${agentActivityVerb(part)} ${toolDisplayName(part)}`),
        detail,
        fullDetail: readable?.fullDetail || fullDetail || detail,
        sections,
        status: part.status
      }
    })
}

function comparableDetail(value: string): string {
  return sanitizeAgentText(value).replace(/\s+/g, ' ').trim()
}

export function shouldShowAgentActivityDetail(line: AgentActivityLine | undefined): boolean {
  if (!line) return false
  if (line.sections.length > 0) return true
  if (!line.fullDetail) return false

  const detail = comparableDetail(line.detail)
  const fullDetail = comparableDetail(line.fullDetail)
  if (!fullDetail) return false
  if (!detail) return true
  if (detail !== fullDetail) return true
  return line.fullDetail.length > INLINE_DETAIL_EXPAND_THRESHOLD
}
