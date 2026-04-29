export type TerminalCompletionSource = 'model'
export type TerminalCompletionMode = 'append' | 'replace'
export type TerminalCompletionConfidence = 'low' | 'medium' | 'high'

export interface TerminalCompletionResult {
  input: string
  value: string
  suffix: string
  insertText: string
  source: TerminalCompletionSource
  mode: TerminalCompletionMode
  confidence: TerminalCompletionConfidence
  displayLabel: string
  alternatives: Array<{
    value: string
    source: TerminalCompletionSource
    mode: TerminalCompletionMode
    confidence: TerminalCompletionConfidence
    displayLabel: string
  }>
}

export type TerminalShiftTabCompletionAction = 'accept' | 'request' | 'wait' | 'hide'

export interface TerminalShiftTabCompletionState {
  hasVisibleCompletion: boolean
  hasCompletionCandidate: boolean
  completionPending: boolean
  input: string
}

function displayLabel(mode: TerminalCompletionMode): string {
  return mode === 'replace' ? 'AI 修正' : 'AI'
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

function isCommandCompatibleWithInput(command: string, input: string): boolean {
  const trimmedInput = input.trim()
  const trimmedCommand = command.trim()
  if (!trimmedInput) return true
  if (!trimmedCommand || trimmedCommand === trimmedInput) return false
  if (trimmedCommand.startsWith(trimmedInput)) return true

  const inputTokens = trimmedInput.toLowerCase().split(/\s+/).filter(Boolean)
  const commandTokens = trimmedCommand.toLowerCase().split(/\s+/).filter(Boolean)
  if (inputTokens.length === 0 || inputTokens.length > commandTokens.length) return false

  return inputTokens.every((token, index) =>
    index === 0
      ? isObviousTokenCorrection(token, commandTokens[index] ?? '')
      : (commandTokens[index] ?? '').startsWith(token)
  )
}

export function getTerminalShiftTabCompletionAction(
  state: TerminalShiftTabCompletionState
): TerminalShiftTabCompletionAction {
  if (state.hasVisibleCompletion) return 'accept'
  if (state.hasCompletionCandidate) return 'accept'
  if (state.completionPending) return 'wait'
  return state.input.trim().length <= 200 ? 'request' : 'hide'
}

export function updateTerminalInputBuffer(current: string, data: string): string {
  let next = current

  for (const char of data) {
    if (char === '\r' || char === '\n' || char === '\x03' || char === '\x15') {
      next = ''
      continue
    }

    if (char === '\x7f' || char === '\b') {
      next = next.slice(0, -1)
      continue
    }

    const code = char.charCodeAt(0)
    if (code >= 32 && code !== 127) {
      next += char
    }
  }

  return next
}

export function shouldRequestContextualCompletionOnTerminalInput(
  currentInput: string,
  data: string
): boolean {
  const submittedInput = inputBeforeFirstEnter(currentInput, data)
  return submittedInput !== null && !submittedInput.trim()
}

export function contextualCompletionDelayForTerminalInput(
  currentInput: string,
  data: string
): number | null {
  const submittedInput = inputBeforeFirstEnter(currentInput, data)
  if (submittedInput === null) return null
  return submittedInput.trim() ? 1600 : 250
}

function inputBeforeFirstEnter(currentInput: string, data: string): string | null {
  let input = currentInput

  for (const char of data) {
    if (char === '\r' || char === '\n') return input
    if (char === '\x03' || char === '\x15') {
      input = ''
      continue
    }
    if (char === '\x7f' || char === '\b') {
      input = input.slice(0, -1)
      continue
    }

    const code = char.charCodeAt(0)
    if (code >= 32 && code !== 127) input += char
  }

  return null
}

function normalizeHistoryCommand(command: string): string {
  return (
    command
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

function firstShellToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

export function expandSingleTokenCompletionFromHistory(
  input: string,
  command: string,
  historyCommands: string[]
): string {
  const trimmedInput = input.trim()
  const trimmedCommand = normalizeHistoryCommand(command)
  if (!trimmedInput || /\s/.test(trimmedInput) || /\s/.test(trimmedCommand)) return command
  if (!isCommandCompatibleWithInput(trimmedCommand, input)) return command

  const completedToken = trimmedCommand.toLowerCase()
  const historyMatch = historyCommands.map(normalizeHistoryCommand).find((historyCommand) => {
    if (!historyCommand || historyCommand.length > 300 || !/\s/.test(historyCommand)) return false
    if (historyCommand.trim() === trimmedCommand) return false
    if (firstShellToken(historyCommand) !== completedToken) return false
    return isCommandCompatibleWithInput(historyCommand, input)
  })

  return historyMatch ?? command
}

export function buildTerminalModelCompletion(
  input: string,
  command: string,
  confidence: TerminalCompletionConfidence = 'high'
): TerminalCompletionResult | null {
  if (confidence === 'low') return null
  const trimmedLeftInput = input.trimStart()
  const trimmedCommand = command
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!trimmedCommand) return null

  const leadingWhitespace = input.length - trimmedLeftInput.length
  const prefix = input.slice(0, leadingWhitespace)
  const value = `${prefix}${trimmedCommand}`
  if (value.trim() === input.trim()) return null
  if (!isCommandCompatibleWithInput(value, input)) return null

  const mode: TerminalCompletionMode = value.startsWith(input) ? 'append' : 'replace'
  const suffix = mode === 'append' ? value.slice(input.length) : ''
  if (mode === 'append' && !suffix) return null

  return {
    input,
    value,
    suffix,
    insertText: mode === 'replace' ? `\x15${value}` : suffix,
    source: 'model',
    mode,
    confidence,
    displayLabel: displayLabel(mode),
    alternatives: [
      {
        value: trimmedCommand,
        source: 'model',
        mode,
        confidence,
        displayLabel: displayLabel(mode)
      }
    ]
  }
}
