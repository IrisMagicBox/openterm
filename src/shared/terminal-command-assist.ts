import type { TerminalSession } from './types'

export type TerminalCommandSessionContext = Pick<
  TerminalSession,
  'id' | 'hostId' | 'hostAlias' | 'name' | 'role'
>

interface TerminalCommandAssistContext {
  topicId?: string
  session?: TerminalCommandSessionContext
  historyCommands: string[]
  screen?: string
}

export interface TerminalCommandDraftRequest extends TerminalCommandAssistContext {
  request: string
  currentInput?: string
}

export interface TerminalCommandDraftResult {
  command: string
}

export type TerminalCommandCompletionConfidence = 'low' | 'medium' | 'high'

export interface TerminalCommandCompletionRequest extends TerminalCommandAssistContext {
  currentInput: string
}

export interface TerminalCommandCompletionResult {
  command: string
  confidence?: TerminalCommandCompletionConfidence
  reason?: string
}

export interface TerminalCommandAssistMessage {
  role: 'system' | 'user'
  content: string
}

function truncateLines(value: string | undefined, maxChars: number): string {
  if (!value?.trim()) return '(empty)'
  const trimmed = value.trim()
  if (trimmed.length <= maxChars) return trimmed
  return trimmed.slice(-maxChars)
}

function formatSession(session: TerminalCommandSessionContext | undefined): string {
  if (!session) return 'unknown'

  return [
    `sessionId: ${session.id}`,
    `hostId: ${session.hostId}`,
    `hostAlias: ${session.hostAlias}`,
    `terminalName: ${session.name || '终端'}`,
    `terminalRole: ${session.role || 'user'}`
  ].join('\n')
}

function formatHistory(historyCommands: string[]): string {
  if (historyCommands.length === 0) return '(empty)'

  return historyCommands
    .slice(0, 12)
    .map((command, index) => `${index + 1}. ${command}`)
    .join('\n')
}

export function buildTerminalCommandDraftMessages(
  input: TerminalCommandDraftRequest
): TerminalCommandAssistMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是一个只服务于当前终端的小型命令草稿 agent。',
        '你的任务是把用户的自然语言意图转成适合当前终端的一行 shell 命令。',
        '不要执行命令，不要调用工具，不要解释，不要寒暄。',
        '只输出 JSON：{"command":"..."}。',
        'command 必须是不带回车的一行命令，用户会检查后自己按 Enter 执行。',
        '如果用户意图不明确，生成最保守、可读、可撤销的查看类命令。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        '目标终端：',
        formatSession(input.session),
        '',
        '当前终端屏幕：',
        truncateLines(input.screen, 4000),
        '',
        '当前命令行输入：',
        input.currentInput?.trim() || '(empty)',
        '',
        '最近历史命令：',
        formatHistory(input.historyCommands),
        '',
        '用户意图：',
        input.request.trim()
      ].join('\n')
    }
  ]
}

export function buildTerminalCommandCompletionMessages(
  input: TerminalCommandCompletionRequest
): TerminalCommandAssistMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是当前终端的 Tab 命令补全引擎。',
        '根据目标终端、当前屏幕、最近历史命令和当前命令行输入，补全或修正 currentInput。',
        '这不是聊天，也不是自然语言命令草稿；你的输出会被 Tab 写回终端命令行。',
        '不要执行命令，不要调用工具，不要解释，不要寒暄。',
        '只输出 JSON：{"command":"...","confidence":"high","reason":"..."}。',
        'command 必须是不带回车的一行 shell 命令。',
        'confidence 只能是 low、medium、high；只有非常确定时才给 high。',
        '对常见 CLI 的明显短前缀，补成最常用且安全的查看类命令，例如 docker im -> docker images，git st -> git status。',
        '可以修正用户前面的拼写错误，例如 kuebclt ge -> kubectl get pods，gti st -> git status。',
        '优先沿着 currentInput 补全；只有错拼、漏字或命令名明显错误时才整行替换。',
        '如果用户已经输入了完整命令，只返回原命令。',
        '只有在输入过短、可能有多种危险解释、或无法判断用户意图时，才返回 {"command":"","confidence":"low","reason":"uncertain"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        '目标终端：',
        formatSession(input.session),
        '',
        '当前终端屏幕：',
        truncateLines(input.screen, 3000),
        '',
        '最近历史命令：',
        formatHistory(input.historyCommands),
        '',
        'currentInput:',
        input.currentInput.trim()
      ].join('\n')
    }
  ]
}

function stripCodeFence(value: string): string {
  const fenced = value.match(/```(?:json|sh|bash|shell)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] ?? value).trim()
}

export function sanitizeTerminalCommandDraft(content: string | null | undefined): string {
  if (!content) return ''

  let text = stripCodeFence(content)

  try {
    const parsed = JSON.parse(text) as { command?: unknown }
    if (typeof parsed.command === 'string') {
      text = parsed.command
    }
  } catch {
    const commandMatch = text.match(/"command"\s*:\s*"((?:\\"|[^"])*)"/)
    if (commandMatch) {
      text = commandMatch[1].replace(/\\"/g, '"')
    }
  }

  return (
    text
      .trim()
      .replace(/^[`$#]\s*/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

export function sanitizeTerminalCommandCompletion(
  content: string | null | undefined
): TerminalCommandCompletionResult {
  if (!content) return { command: '', confidence: 'low' }

  const text = stripCodeFence(content)

  try {
    const parsed = JSON.parse(text) as {
      command?: unknown
      confidence?: unknown
      reason?: unknown
    }
    const command =
      typeof parsed.command === 'string' ? sanitizeTerminalCommandDraft(parsed.command) : ''
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : command
          ? 'medium'
          : 'low'
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined
    return { command, confidence, reason }
  } catch {
    const command = sanitizeTerminalCommandDraft(text)
    return { command, confidence: command ? 'medium' : 'low' }
  }
}
