import type { AgentPart } from '../../../shared/types'

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

export function sanitizeAgentText(value: string): string {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(/\\u0000/gi, '')
    .replace(/\\u001b/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function parseJson(value: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function parseAgentPartCommand(part: AgentPart): string {
  if (part.toolName === 'websearch' && typeof part.metadata?.displayQuery === 'string') {
    return sanitizeAgentText(part.metadata.displayQuery)
  }
  if (!part.input) return ''
  const parsed = parseJson(part.input)
  if (!parsed) return sanitizeAgentText(part.input)
  if (typeof parsed.command === 'string') return sanitizeAgentText(parsed.command)
  if (typeof parsed.path === 'string') return sanitizeAgentText(parsed.path)
  if (typeof parsed.action === 'string') return sanitizeAgentText(parsed.action)
  return sanitizeAgentText(JSON.stringify(parsed))
}

export function agentPartPreview(part: AgentPart, limit = 120): string {
  const command = parseAgentPartCommand(part)
  if (part.toolName === 'execute_command' && command) return truncate(`$ ${command}`, limit)

  const raw = part.error || part.output || part.input || ''
  const parsed = parseJson(raw)
  if (parsed && typeof parsed.content === 'string') {
    const exit = typeof parsed.exitCode === 'number' ? `Exit ${parsed.exitCode}: ` : ''
    return truncate(`${exit}${sanitizeAgentText(parsed.content)}`, limit)
  }

  return truncate(sanitizeAgentText(raw), limit)
}

export function agentPartOutput(part: AgentPart): string {
  const raw = part.error || part.output || ''
  const parsed = parseJson(raw)
  if (parsed && typeof parsed.content === 'string') {
    const exit = typeof parsed.exitCode === 'number' ? `Exit ${parsed.exitCode}\n` : ''
    return `${exit}${sanitizeAgentText(parsed.content)}`
  }
  return sanitizeAgentText(raw)
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 3))}...`
}
