import { ipcMain } from 'electron'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { ProviderAdapter } from '../agent/provider-adapter'
import { logger } from '../logger'
import {
  buildTerminalCommandCompletionMessages,
  buildTerminalCommandDraftMessages,
  normalizeTerminalCompletionMode,
  sanitizeTerminalCommandCompletion,
  sanitizeTerminalCommandDraft,
  type TerminalCommandCompletionRequest,
  type TerminalCommandCompletionResult,
  type TerminalCommandCompletionUiEvent,
  type TerminalCommandExecutionContextEntry,
  type TerminalCommandDraftRequest,
  type TerminalCommandDraftResult
} from '../../shared/terminal-command-assist'
import { modelSettingsDB, terminalIODB } from '../db'

const TERMINAL_COMPLETION_MANUAL_TIMEOUT_MS = 30_000
const TERMINAL_COMPLETION_PREFETCH_TIMEOUT_MS = 12_000
const TERMINAL_COMPLETION_PROVIDER_BACKOFF_MS = 60_000
const TERMINAL_COMPLETION_TRANSIENT_BACKOFF_MS = 10_000
const TERMINAL_COMPLETION_TOOL_NAME = 'complete_terminal_command'

const TERMINAL_COMPLETION_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TERMINAL_COMPLETION_TOOL_NAME,
    description: 'Return the terminal command completion for the current input.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'One-line shell command completion, or empty string when uncertain.'
        },
        confidence: {
          type: 'string',
          enum: ['low', 'medium', 'high']
        },
        reason: {
          type: 'string'
        }
      },
      required: ['command', 'confidence'],
      additionalProperties: false
    }
  }
}

let terminalCompletionUnavailableUntil = 0
let terminalCompletionRequestSeq = 0
const terminalCompletionInFlight = new Map<
  string,
  {
    controller: AbortController
    requestId: number
    cancelledByNewerRequest: boolean
    timedOut: boolean
  }
>()

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function completionFromToolCall(
  response: { toolCalls?: Array<{ function: { name: string; arguments: string } }> },
  currentInput: string
): TerminalCommandCompletionResult | null {
  const call = response.toolCalls?.find(
    (toolCall) => toolCall.function.name === TERMINAL_COMPLETION_TOOL_NAME
  )
  if (!call) return null

  return sanitizeTerminalCommandCompletion(call.function.arguments, currentInput, {
    formats: ['json']
  })
}

function completionSessionKey(request: TerminalCommandCompletionRequest): string {
  return (
    request.session?.id || `${request.topicId || 'unknown'}:${request.session?.hostId || 'unknown'}`
  )
}

function completionTimeoutMs(trigger: 'prefetch' | 'manual'): number {
  return trigger === 'prefetch'
    ? TERMINAL_COMPLETION_PREFETCH_TIMEOUT_MS
    : TERMINAL_COMPLETION_MANUAL_TIMEOUT_MS
}

function trimTerminalOutputForCompletion(content: string | undefined, maxChars = 1200): string {
  if (!content?.trim()) return ''
  const trimmed = content.trim()
  if (trimmed.length <= maxChars) return trimmed

  const headLength = Math.floor(maxChars * 0.25)
  const tailLength = maxChars - headLength
  return `${trimmed.slice(0, headLength)}\n... [truncated] ...\n${trimmed.slice(-tailLength)}`
}

function buildExecutionContextFromHistory(
  request: TerminalCommandCompletionRequest
): TerminalCommandExecutionContextEntry[] {
  if (request.executionContext?.length) return request.executionContext.slice(-8)
  const sessionId = request.session?.id
  if (!sessionId) return []

  const ioEntries = terminalIODB.getIOBySession(sessionId, 32)
  const outputsByInputId = new Map<string, (typeof ioEntries)[number]>()
  for (const io of ioEntries) {
    if (io.type === 'output' && io.relatedInputId) {
      outputsByInputId.set(io.relatedInputId, io)
    }
  }

  return ioEntries
    .filter((io) => io.type === 'input')
    .slice(-8)
    .map((input) => {
      const output = outputsByInputId.get(input.id)
      return {
        command: input.content,
        source: input.source,
        timestamp: input.timestamp,
        output: trimTerminalOutputForCompletion(output?.content),
        exitCode: output?.exitCode,
        durationMs: output?.durationMs,
        cwd: output?.cwd || input.cwd,
        isTruncated: output?.isTruncated
      }
    })
}

export async function draftTerminalCommand(
  request: TerminalCommandDraftRequest
): Promise<TerminalCommandDraftResult> {
  const adapter = new ProviderAdapter({ topicId: request.topicId })
  const messages = buildTerminalCommandDraftMessages(request) as ChatCompletionMessageParam[]
  const response = await adapter.chat({
    messages,
    toolChoice: 'none',
    temperature: 0,
    maxTokens: 120
  })
  const command = sanitizeTerminalCommandDraft(response.content)

  if (!command) {
    throw new Error('没有生成可写入终端的命令。')
  }

  return { command }
}

export async function completeTerminalCommand(
  request: TerminalCommandCompletionRequest
): Promise<TerminalCommandCompletionResult> {
  const requestId = ++terminalCompletionRequestSeq
  const startedAt = Date.now()
  const trigger = request.trigger ?? 'manual'
  const timeoutMs = completionTimeoutMs(trigger)

  if (Date.now() < terminalCompletionUnavailableUntil) {
    logger.warn('TerminalCompletion', `#${requestId} skipped: provider backoff`, {
      requestId,
      trigger,
      currentInput: request.currentInput,
      unavailableForMs: terminalCompletionUnavailableUntil - Date.now()
    })
    return { command: '', confidence: 'low', reason: 'backoff' }
  }

  const completionMode = normalizeTerminalCompletionMode(
    modelSettingsDB.getSettings().terminalCompletionMode
  )
  const executionContext = buildExecutionContextFromHistory(request)
  const enrichedRequest: TerminalCommandCompletionRequest = {
    ...request,
    executionContext
  }

  logger.info('TerminalCompletion', `#${requestId} request`, {
    requestId,
    mode: completionMode,
    trigger,
    topicId: request.topicId,
    currentInput: request.currentInput,
    sessionId: request.session?.id,
    hostId: request.session?.hostId,
    hostAlias: request.session?.hostAlias,
    historyCount: request.historyCommands.length,
    executionContextCount: executionContext.length,
    executionContextChars: executionContext.reduce(
      (total, item) => total + item.command.length + (item.output?.length ?? 0),
      0
    ),
    screenChars: request.screen?.length ?? 0,
    timeoutMs
  })

  const adapter = new ProviderAdapter({ topicId: request.topicId })
  const messages = buildTerminalCommandCompletionMessages(
    enrichedRequest,
    completionMode
  ) as ChatCompletionMessageParam[]
  const controller = new AbortController()
  const sessionKey = completionSessionKey(request)
  const previousRequest = terminalCompletionInFlight.get(sessionKey)
  if (previousRequest) {
    previousRequest.cancelledByNewerRequest = true
    previousRequest.controller.abort()
  }

  const inFlightRequest = {
    controller,
    requestId,
    cancelledByNewerRequest: false,
    timedOut: false
  }
  terminalCompletionInFlight.set(sessionKey, inFlightRequest)
  const timeout = setTimeout(() => {
    inFlightRequest.timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const chatParams: Parameters<ProviderAdapter['chat']>[0] = {
      messages,
      temperature: 0,
      maxTokens: completionMode === 'function' ? 220 : 180,
      abortSignal: controller.signal
    }

    if (completionMode === 'function') {
      chatParams.tools = [TERMINAL_COMPLETION_TOOL]
      chatParams.toolChoice = {
        type: 'function',
        function: { name: TERMINAL_COMPLETION_TOOL_NAME }
      }
    } else {
      chatParams.toolChoice = 'none'
    }

    const response = await adapter.chat(chatParams)
    const completion =
      (completionMode === 'function'
        ? completionFromToolCall(response, request.currentInput)
        : null) ??
      sanitizeTerminalCommandCompletion(response.content, request.currentInput, {
        formats: completionMode === 'function' ? ['json'] : ['xml', 'json']
      })
    const durationMs = Date.now() - startedAt

    logger.info('TerminalCompletion', `#${requestId} response`, {
      requestId,
      mode: completionMode,
      trigger,
      durationMs,
      raw: response.content,
      toolCalls: response.toolCalls?.map((toolCall) => ({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      })),
      command: completion.command,
      confidence: completion.confidence,
      reason: completion.reason
    })

    if (!completion.command) {
      return { command: '', confidence: 'low', reason: completion.reason || 'empty' }
    }

    return completion
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (controller.signal.aborted) {
      const reason = inFlightRequest.cancelledByNewerRequest
        ? 'cancelled'
        : inFlightRequest.timedOut
          ? 'timeout'
          : 'aborted'
      logger.warn('TerminalCompletion', `#${requestId} aborted`, {
        requestId,
        mode: completionMode,
        trigger,
        durationMs,
        reason,
        error: errorMessage(error)
      })
      return { command: '', confidence: 'low', reason }
    }

    const status = errorStatus(error)
    terminalCompletionUnavailableUntil =
      Date.now() +
      (status && status >= 400 && status < 500
        ? TERMINAL_COMPLETION_PROVIDER_BACKOFF_MS
        : TERMINAL_COMPLETION_TRANSIENT_BACKOFF_MS)
    logger.error('TerminalCompletion', `#${requestId} provider error`, {
      requestId,
      mode: completionMode,
      trigger,
      durationMs,
      status,
      error: errorMessage(error),
      backoffMs: terminalCompletionUnavailableUntil - Date.now()
    })
    return { command: '', confidence: 'low', reason: 'provider-error' }
  } finally {
    clearTimeout(timeout)
    if (terminalCompletionInFlight.get(sessionKey)?.requestId === requestId) {
      terminalCompletionInFlight.delete(sessionKey)
    }
  }
}

export function registerTerminalCommandAssistIPC(): void {
  ipcMain.removeHandler('terminal-command-assist:draft')
  ipcMain.handle('terminal-command-assist:draft', (_, request: TerminalCommandDraftRequest) =>
    draftTerminalCommand(request)
  )

  ipcMain.removeHandler('terminal-command-assist:complete')
  ipcMain.handle(
    'terminal-command-assist:complete',
    (_, request: TerminalCommandCompletionRequest) => completeTerminalCommand(request)
  )

  ipcMain.removeAllListeners('terminal-command-assist:ui-event')
  ipcMain.on('terminal-command-assist:ui-event', (_, event: TerminalCommandCompletionUiEvent) => {
    logger.info('TerminalCompletionUI', event.event, event)
  })
}
