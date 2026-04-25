import type { TerminalCompletionBackendMode, TerminalSession } from './types'

export const DEFAULT_TERMINAL_COMPLETION_MODE: TerminalCompletionBackendMode = 'prompt'

export function normalizeTerminalCompletionMode(value: unknown): TerminalCompletionBackendMode {
  return value === 'function' ? 'function' : DEFAULT_TERMINAL_COMPLETION_MODE
}

export type TerminalCommandSessionContext = Pick<
  TerminalSession,
  'id' | 'hostId' | 'hostAlias' | 'name' | 'role'
>

export interface TerminalCommandExecutionContextEntry {
  command: string
  source?: 'agent' | 'user' | 'system'
  timestamp?: number
  output?: string
  exitCode?: number
  durationMs?: number
  cwd?: string
  isTruncated?: boolean
}

interface TerminalCommandAssistContext {
  topicId?: string
  session?: TerminalCommandSessionContext
  historyCommands: string[]
  executionContext?: TerminalCommandExecutionContextEntry[]
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
  trigger?: 'prefetch' | 'manual'
}

export interface TerminalCommandCompletionResult {
  command: string
  confidence?: TerminalCommandCompletionConfidence
  reason?: string
}

export interface TerminalCommandCompletionUiEvent {
  event: 'candidate-stored' | 'candidate-cleared' | 'shift-tab' | 'candidate-accepted'
  sessionId?: string
  topicId?: string
  trigger?: 'prefetch' | 'manual'
  action?: 'accept' | 'request' | 'wait' | 'hide'
  visible?: boolean
  pending?: boolean
  input?: string
  candidate?: string
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

function truncateBlock(value: string | undefined, maxChars: number): string {
  if (!value?.trim()) return '(empty)'
  const trimmed = value.trim()
  if (trimmed.length <= maxChars) return trimmed

  const headLength = Math.floor(maxChars * 0.35)
  const tailLength = maxChars - headLength
  return `${trimmed.slice(0, headLength)}\n... [truncated] ...\n${trimmed.slice(-tailLength)}`
}

function indentBlock(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join('\n')
}

function formatExecutionContext(
  executionContext: TerminalCommandExecutionContextEntry[] | undefined
): string {
  if (!executionContext || executionContext.length === 0) return '(empty)'

  return executionContext
    .slice(-8)
    .map((entry, index) => {
      const metadata = [
        entry.source ? `source=${entry.source}` : undefined,
        entry.cwd ? `cwd=${entry.cwd}` : undefined,
        entry.exitCode !== undefined ? `exit=${entry.exitCode}` : undefined,
        entry.durationMs !== undefined ? `durationMs=${entry.durationMs}` : undefined,
        entry.isTruncated ? 'output=truncated' : undefined
      ]
        .filter(Boolean)
        .join(', ')
      const output = entry.output?.trim()
        ? `\n  output:\n${indentBlock(truncateBlock(entry.output, 700))}`
        : ''
      return `${index + 1}. ${entry.command}${metadata ? ` (${metadata})` : ''}${output}`
    })
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
  input: TerminalCommandCompletionRequest,
  mode: TerminalCompletionBackendMode = DEFAULT_TERMINAL_COMPLETION_MODE
): TerminalCommandAssistMessage[] {
  const systemPrompt =
    mode === 'function'
      ? [
          'You are a terminal command completion engine.',
          'Use the complete_terminal_command function to return the completion.',
          'If you cannot call the function, return exactly one JSON object and nothing else.',
          'JSON schema: {"command":"one-line shell command or empty string","confidence":"low|medium|high","reason":"short reason"}',
          'Do not explain. Do not use Markdown.',
          'Complete or correct currentInput using the terminal execution context, screen, and recent command history.',
          'Use recent commands, outputs, exit codes, cwd, errors, and visible terminal state to infer the next useful completion.',
          'Prefer extending currentInput. Replace the whole command only for obvious typos.',
          'Examples:',
          'currentInput=docker im => {"command":"docker images","confidence":"high","reason":"common docker image listing command"}',
          'currentInput=git st => {"command":"git status","confidence":"high","reason":"common git status abbreviation"}',
          'currentInput=kuebclt ge => {"command":"kubectl get pods","confidence":"medium","reason":"obvious kubectl typo"}',
          'If uncertain, output {"command":"","confidence":"low","reason":"uncertain"}.'
        ].join('\n')
      : [
          'You are a terminal command completion engine.',
          'Return exactly one terminal completion XML block and nothing else.',
          'Format:',
          '<terminal_completion>',
          '  <command>one-line shell command or empty string</command>',
          '  <confidence>low|medium|high</confidence>',
          '  <reason>short reason</reason>',
          '</terminal_completion>',
          'Do not explain. Do not use Markdown. Do not include text outside the XML block.',
          'Complete or correct currentInput using the terminal execution context, screen, and recent command history.',
          'Use recent commands, outputs, exit codes, cwd, errors, and visible terminal state to infer the next useful completion.',
          'Prefer extending currentInput. Replace the whole command only for obvious typos.',
          'Examples:',
          'currentInput=docker im => <terminal_completion><command>docker images</command><confidence>high</confidence><reason>common docker image listing command</reason></terminal_completion>',
          'currentInput=git st => <terminal_completion><command>git status</command><confidence>high</confidence><reason>common git status abbreviation</reason></terminal_completion>',
          'currentInput=kuebclt ge => <terminal_completion><command>kubectl get pods</command><confidence>medium</confidence><reason>obvious kubectl typo</reason></terminal_completion>',
          'If uncertain, return <terminal_completion><command></command><confidence>low</confidence><reason>uncertain</reason></terminal_completion>.'
        ].join('\n')

  return [
    {
      role: 'system',
      content: systemPrompt
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
        '最近终端执行上下文：',
        formatExecutionContext(input.executionContext),
        '',
        '最近历史命令：',
        formatHistory(input.historyCommands),
        '',
        'currentInput:',
        input.currentInput.trim(),
        '',
        mode === 'function'
          ? 'Use the function call when available. Otherwise return only JSON.'
          : 'Return only the XML block. The first characters must be <terminal_completion>.'
      ].join('\n')
    }
  ]
}

function stripCodeFence(value: string): string {
  const fenced = value.match(/```(?:json|sh|bash|shell)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] ?? value).trim()
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
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

type CompletionOutputFormat = 'xml' | 'json'

interface CompletionParseOptions {
  formats?: CompletionOutputFormat[]
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const text = value.trim()
  if (!text.startsWith('{') || !text.endsWith('}')) return null

  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function extractXmlTag(value: string, tagName: string): string | undefined {
  const match = value.match(new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, 'i'))
  return match ? decodeXmlText(match[1]).trim() : undefined
}

function parseCompletionXmlObject(value: string): Record<string, unknown> | null {
  const text = value.trim()
  const match = text.match(/^<terminal_completion>\s*([\s\S]*?)\s*<\/terminal_completion>$/i)
  if (!match) return null

  const block = match[1]

  const command = extractXmlTag(block, 'command')
  if (command === undefined) return null

  return {
    command,
    confidence: extractXmlTag(block, 'confidence') || undefined,
    reason: extractXmlTag(block, 'reason') || undefined
  }
}

function looksLikeModelCommentary(value: string): boolean {
  return [
    /^(?:let me|let's|i(?:'ll| will| can| need| would)?\b|we\b)/i,
    /^(?:based on|looking at|analyz(?:e|ing)|the\b|this\b|that\b|to\b)/i,
    /^(?:sure\b|not sure\b|sorry\b|here(?:'s| is)\b|first\b|please\b|current\b|okay\b|ok\b)/i,
    /^(?:用户|当前|根据|从|考虑|历史|这|这个|看起来|正在|可能|应该|因此|所以)/
  ].some((pattern) => pattern.test(value.trim()))
}

function looksLikePlainShellCommand(value: string): boolean {
  const command = value.trim()
  if (!command || command.length > 300 || /[\r\n]/.test(command)) return false
  if (looksLikeModelCommentary(command)) return false
  if (/^(?:```|\{|\[)/.test(command)) return false

  const firstToken = command.match(
    /^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:sudo\s+|env\s+)?([^\s;&|()<>]+)/
  )?.[1]
  if (!firstToken) return false
  if (/^(?:\.{0,2}\/|~\/|\/)/.test(firstToken)) return true
  if (!/^[a-z0-9][a-z0-9_.+-]*$/.test(firstToken)) return false

  return true
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitutionCost)
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j]
  }

  return previous[b.length]
}

function isObviousTokenCorrection(inputToken: string, commandToken: string): boolean {
  if (!inputToken || !commandToken) return false
  if (commandToken.startsWith(inputToken)) return true
  if (inputToken[0] !== commandToken[0]) return false

  const maxLength = Math.max(inputToken.length, commandToken.length)
  const threshold = maxLength >= 5 ? Math.ceil(maxLength * 0.55) : 1
  return editDistance(inputToken, commandToken) <= threshold
}

function commandMatchesCurrentInput(command: string, currentInput: string | undefined): boolean {
  const input = currentInput?.trim()
  const normalizedCommand = command.trim()
  if (!input) return true
  if (!normalizedCommand || normalizedCommand === input) return false
  if (normalizedCommand.startsWith(input)) return true

  const inputTokens = input.toLowerCase().split(/\s+/).filter(Boolean)
  const commandTokens = normalizedCommand.toLowerCase().split(/\s+/).filter(Boolean)
  if (inputTokens.length === 0 || inputTokens.length > commandTokens.length) return false

  return inputTokens.every((token, index) =>
    index === 0
      ? isObviousTokenCorrection(token, commandTokens[index] ?? '')
      : (commandTokens[index] ?? '').startsWith(token)
  )
}

export function sanitizeTerminalCommandCompletion(
  content: string | null | undefined,
  currentInput?: string,
  options: CompletionParseOptions = {}
): TerminalCommandCompletionResult {
  if (!content) return { command: '', confidence: 'low' }

  const text = content.trim()
  const formats = options.formats ?? (['xml', 'json'] satisfies CompletionOutputFormat[])
  const parsed =
    (formats.includes('xml') ? parseCompletionXmlObject(text) : null) ??
    (formats.includes('json') ? parseJsonObject(text) : null)

  if (parsed) {
    const command =
      typeof parsed.command === 'string' ? sanitizeTerminalCommandDraft(parsed.command) : ''
    if (command && !looksLikePlainShellCommand(command)) {
      return { command: '', confidence: 'low', reason: 'invalid-command' }
    }
    if (command && !commandMatchesCurrentInput(command, currentInput)) {
      return { command: '', confidence: 'low', reason: 'mismatched-input' }
    }
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : command
          ? 'medium'
          : 'low'
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined
    return { command, confidence, reason }
  }

  return { command: '', confidence: 'low', reason: 'invalid-format' }
}
