import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import { createHash } from 'crypto'

export const REPEATED_TOOL_CALL_THRESHOLD = 3
const MAX_LEDGER_OBSERVATION_CHARS = 2000

export type ToolCallLedgerStatus = 'pending' | 'completed' | 'error' | 'blocked' | 'timeout'

export interface ToolCallLedgerEntry {
  signature: string
  toolName: string
  canonicalArgs: Record<string, unknown>
  count: number
  firstTurn: number
  lastTurn: number
  lastStatus: ToolCallLedgerStatus
  lastObservationStatus?: ToolCallLedgerStatus
  lastObservation?: string
  lastOutputHash?: string
  lastOutputRepeated?: boolean
  repeatCount: number
}

export interface ToolCallAttempt {
  call: ChatCompletionMessageFunctionToolCall
  args: Record<string, unknown>
  signature: string
  count: number
  entry: ToolCallLedgerEntry
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function truncateObservation(value: string): string {
  if (value.length <= MAX_LEDGER_OBSERVATION_CHARS) return value
  return `${value.slice(0, MAX_LEDGER_OBSERVATION_CHARS)}\n...[truncated]`
}

function hashOutput(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export class ToolCallLedger {
  private entries = new Map<string, ToolCallLedgerEntry>()

  static signatureFor(toolName: string, args: Record<string, unknown>): string {
    const canonicalArgs = ToolCallLedger.canonicalArgsFor(toolName, args)
    return `${toolName}:${stableStringify(canonicalArgs)}`
  }

  static canonicalArgsFor(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    if (toolName === 'execute_command') {
      return {
        hostId: stringValue(args.hostId) ?? '',
        command: stringValue(args.command) ?? '',
        workdir: stringValue(args.workdir) ?? '',
        terminalName: stringValue(args.terminalName) ?? '',
        timeoutMs: numberValue(args.timeoutMs)
      }
    }

    if (toolName === 'create_artifact') {
      const content = stringValue(args.content) ?? ''
      return {
        title: stringValue(args.title) ?? '',
        type: stringValue(args.type) ?? '',
        source: stringValue(args.source) ?? '',
        contentLength: numberValue(args.contentLength) ?? content.length
      }
    }

    const copy = { ...args }
    delete copy.reason
    return copy
  }

  restore(entries: ToolCallLedgerEntry[] = []): void {
    this.entries.clear()
    for (const entry of entries) {
      this.entries.set(entry.signature, {
        ...entry,
        repeatCount:
          typeof entry.repeatCount === 'number'
            ? entry.repeatCount
            : Math.max(0, entry.count - 1)
      })
    }
  }

  snapshot(): ToolCallLedgerEntry[] {
    return Array.from(this.entries.values()).map((entry) => ({
      ...entry,
      repeatCount: Math.max(0, entry.count - 1)
    }))
  }

  previewBatch(toolCalls: ChatCompletionMessageFunctionToolCall[]): string {
    return toolCalls
      .map((call) => {
        const args = this.safeParseArgs(call.function.arguments)
        return ToolCallLedger.signatureFor(call.function.name, args)
      })
      .join('|')
  }

  registerAttempts(
    calls: Array<{ call: ChatCompletionMessageFunctionToolCall; args: Record<string, unknown> }>,
    turn: number
  ): ToolCallAttempt[] {
    const attempts: ToolCallAttempt[] = []

    for (const { call, args } of calls) {
      const signature = ToolCallLedger.signatureFor(call.function.name, args)
      const canonicalArgs = ToolCallLedger.canonicalArgsFor(call.function.name, args)
      const entry =
        this.entries.get(signature) ??
        ({
          signature,
          toolName: call.function.name,
          canonicalArgs,
          count: 0,
          firstTurn: turn,
          lastTurn: turn,
          lastStatus: 'pending',
          repeatCount: 0
        } satisfies ToolCallLedgerEntry)

      entry.count += 1
      entry.lastTurn = turn
      entry.lastStatus = 'pending'
      entry.repeatCount = Math.max(0, entry.count - 1)
      this.entries.set(signature, entry)

      attempts.push({ call, args, signature, count: entry.count, entry })
    }

    return attempts
  }

  recordObservation(
    toolName: string,
    args: Record<string, unknown>,
    observation: string,
    status: ToolCallLedgerStatus = this.inferStatus(observation)
  ): ToolCallLedgerEntry {
    const signature = ToolCallLedger.signatureFor(toolName, args)
    const canonicalArgs = ToolCallLedger.canonicalArgsFor(toolName, args)
    const nextOutputHash = hashOutput(observation)
    const entry =
      this.entries.get(signature) ??
      ({
        signature,
        toolName,
        canonicalArgs,
        count: 0,
        firstTurn: 0,
        lastTurn: 0,
        lastStatus: status,
        repeatCount: 0
      } satisfies ToolCallLedgerEntry)

    entry.lastOutputRepeated = entry.lastOutputHash === nextOutputHash
    entry.lastStatus = status
    entry.lastObservationStatus = status
    entry.lastObservation = truncateObservation(observation)
    entry.lastOutputHash = nextOutputHash
    entry.repeatCount = Math.max(0, entry.count - 1)
    this.entries.set(signature, entry)
    return entry
  }

  repeatedCallCount(): number {
    return Array.from(this.entries.values()).reduce((sum, entry) => sum + entry.repeatCount, 0)
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || '{}') as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private inferStatus(observation: string): ToolCallLedgerStatus {
    if (/Exit:\s*-1|timed out|timeout|超时/i.test(observation)) return 'timeout'
    if (/^Error:|Tool execution aborted|Request was aborted/i.test(observation)) return 'error'
    return 'completed'
  }
}
