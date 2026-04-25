import { ipcMain } from 'electron'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { ProviderAdapter } from '../agent/provider-adapter'
import {
  buildTerminalCommandCompletionMessages,
  buildTerminalCommandDraftMessages,
  sanitizeTerminalCommandCompletion,
  sanitizeTerminalCommandDraft,
  type TerminalCommandCompletionRequest,
  type TerminalCommandCompletionResult,
  type TerminalCommandDraftRequest,
  type TerminalCommandDraftResult
} from '../../shared/terminal-command-assist'

const TERMINAL_COMPLETION_TIMEOUT_MS = 2500
const TERMINAL_COMPLETION_PROVIDER_BACKOFF_MS = 60_000
const TERMINAL_COMPLETION_TRANSIENT_BACKOFF_MS = 10_000

let terminalCompletionUnavailableUntil = 0

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
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
  if (Date.now() < terminalCompletionUnavailableUntil) {
    return { command: '', confidence: 'low', reason: 'backoff' }
  }

  const adapter = new ProviderAdapter({ topicId: request.topicId })
  const messages = buildTerminalCommandCompletionMessages(request) as ChatCompletionMessageParam[]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TERMINAL_COMPLETION_TIMEOUT_MS)

  try {
    const response = await adapter.chat({
      messages,
      toolChoice: 'none',
      temperature: 0,
      maxTokens: 80,
      abortSignal: controller.signal
    })
    const completion = sanitizeTerminalCommandCompletion(response.content)

    if (!completion.command) {
      return { command: '', confidence: 'low', reason: completion.reason || 'empty' }
    }

    return completion
  } catch (error) {
    const status = errorStatus(error)
    terminalCompletionUnavailableUntil =
      Date.now() +
      (status && status >= 400 && status < 500
        ? TERMINAL_COMPLETION_PROVIDER_BACKOFF_MS
        : TERMINAL_COMPLETION_TRANSIENT_BACKOFF_MS)
    return { command: '', confidence: 'low', reason: 'provider-error' }
  } finally {
    clearTimeout(timeout)
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
}
