import { WebContents } from 'electron'
import * as HeadlessXterm from '@xterm/headless'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import {
  TerminalSession,
  TerminalIO,
  CommandResult,
  TerminalStream,
  TerminalSessionDeletedBy,
  TerminalSessionRole,
  TerminalTakeoverMode
} from '../shared/types'
import { topicDB, hostDB } from './db'
import { ShellIntegrationParser, stripAnsi } from './terminal/shell-integration-parser'
import { TerminalCommandQueue } from './terminal/terminal-command-queue'
import { TerminalHistoryRecorder } from './terminal/terminal-history-recorder'
import { TerminalStateStore } from './terminal/terminal-state-store'
import {
  MAX_OUTPUT_SIZE,
  STREAMING_CHUNK_SIZE,
  STREAMING_FLUSH_INTERVAL_MS,
  COMMAND_TIMEOUT_MS,
  RAW_BUFFER_MAX,
  RAW_BUFFER_TRIM,
  TRUNCATION_HEAD_SIZE,
  TRUNCATION_TAIL_SIZE,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS
} from './constants'

type HeadlessXtermModule = typeof HeadlessXterm & { default?: typeof HeadlessXterm }
type HeadlessTerminal = InstanceType<typeof HeadlessXterm.Terminal>

const HeadlessTerminalCtor =
  (HeadlessXterm as HeadlessXtermModule).Terminal ??
  (HeadlessXterm as HeadlessXtermModule).default?.Terminal

if (!HeadlessTerminalCtor) {
  throw new Error('@xterm/headless Terminal export is unavailable')
}

const SCREEN_HISTORY_LIMIT = 120
const SCREEN_HISTORY_TTL_MS = 10 * 60 * 1000
const SCREEN_POLL_INTERVAL_MS = 250

interface ActiveCommand {
  inputId: string
  sessionId: string
  startTime: number
  resolve: (result: CommandResult) => void
  reject: (error: Error) => void
  outputBuffer: string
  liveOutputBuffer: string
  isStreaming: boolean
  remainingEcho?: string
  onOutputChunk?: (chunk: string, fullOutput: string) => void
}

export interface CommandExecutionOptions {
  onOutputChunk?: (chunk: string, fullOutput: string) => void
  timeoutMs?: number
}

export type TerminalScreenPhase = 'running' | 'stable_output' | 'awaiting_input' | 'unknown'

export type TerminalScreenPhaseConfidence = 'low' | 'medium' | 'high'

export interface TerminalScreenLine {
  row: number
  text: string
  wrapped: boolean
}

export interface TerminalScreenSnapshot {
  sessionId: string
  hostId: string
  hostAlias: string
  cols: number
  rows: number
  cursorX: number
  cursorY: number
  bufferType: 'normal' | 'alternate'
  viewportY: number
  baseY: number
  isLocked: boolean
  lockedBy: 'agent' | 'user' | null
  isCommandRunning: boolean
  updatedAt: number
  lines: TerminalScreenLine[]
  visibleText: string
  cursorLineText?: string
  selectedLineText?: string
  nonEmptyLines?: string[]
  phase?: TerminalScreenPhase
  phaseConfidence?: TerminalScreenPhaseConfidence
  inputHints?: string[]
  menuLike?: boolean
  alternateBuffer?: boolean
  hasSpinner?: boolean
  hasProgress?: boolean
  visibleTextHash?: string
}

export interface TerminalChangedLine {
  row: number
  previous?: string
  current: string
}

export interface TerminalScreenHistoryEntry {
  updatedAt: number
  hash: string
  cursorX: number
  cursorY: number
  bufferType: 'normal' | 'alternate'
  cols: number
  rows: number
  changedLines: TerminalChangedLine[]
  excerpt: string
}

export interface WaitTerminalTextOptions {
  text?: string
  regex?: RegExp
  timeoutMs: number
  stableMs?: number
}

export interface WaitTerminalTextResult {
  matched: boolean
  timedOut: boolean
  elapsedMs: number
  snapshot: TerminalScreenSnapshot
}

export interface WaitTerminalActivityOptions {
  stopText?: string
  stopRegex?: RegExp
  timeoutMs: number
  idleMs: number
  requireFreshMatch: boolean
  returnOnIdle?: boolean
}

export interface WaitTerminalActivityResult {
  status: 'matched' | 'stable_output' | 'awaiting_input' | 'idle' | 'timeout'
  screenPhase: TerminalScreenPhase
  matched: boolean
  timedOut: boolean
  elapsedMs: number
  idleMs: number
  snapshot: TerminalScreenSnapshot
  history: TerminalScreenHistoryEntry[]
}

function nonEmptyScreenLines(snapshot: TerminalScreenSnapshot): string[] {
  return snapshot.lines.map((line) => line.text.trimEnd()).filter((line) => line.trim().length > 0)
}

function lastNonEmptyLine(snapshot: TerminalScreenSnapshot): string {
  return nonEmptyScreenLines(snapshot).at(-1)?.trim() ?? ''
}

function progressMarkers(text: string): string[] {
  const markers: string[] = []
  if (/\b\d{1,3}(?:\.\d+)?%\b/.test(text) || /\(\s*\d{1,3}(?:\.\d+)?%\s*\)/.test(text)) {
    markers.push('progress_percent')
  }
  if (
    /\b(?:loading|running|processing|analyzing|thinking|generating|installing|building)\b/i.test(
      text
    )
  ) {
    markers.push('running_word')
  }
  if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒]/.test(text)) {
    markers.push('spinner')
  }
  if (/\b(?:esc|ctrl\+[a-z])\s+(?:interrupt|commands)\b/i.test(text)) {
    markers.push('interactive_status')
  }
  return markers
}

function hasRunningMarker(text: string): boolean {
  return progressMarkers(text).length > 0
}

function inputPromptHints(snapshot: TerminalScreenSnapshot): string[] {
  const text = snapshot.visibleText
  const lastLine = lastNonEmptyLine(snapshot)
  const cursorLine = snapshot.lines[snapshot.cursorY]?.text.trim() ?? ''
  const scopes = [text, lastLine, cursorLine]
  const patterns: Array<[string, RegExp]> = [
    ['enter_to_continue', /\b(?:press|hit)\s+(?:enter|return)\b/i],
    ['confirm_choice', /\b(?:continue|confirm|select|choose|yes\/no|y\/n)\b/i],
    ['ask_anything', /\bask anything\b/i],
    ['input_prompt', /\binput\b/i],
    ['question_prompt', /\?$/]
  ]

  return patterns
    .filter(([, pattern]) => scopes.some((scope) => pattern.test(scope)))
    .map(([hint]) => hint)
}

function hasInputPrompt(snapshot: TerminalScreenSnapshot): boolean {
  return inputPromptHints(snapshot).length > 0
}

export function classifyTerminalScreen(
  snapshot: TerminalScreenSnapshot,
  _history: TerminalScreenHistoryEntry[] = []
): TerminalScreenPhase {
  void _history
  const lines = nonEmptyScreenLines(snapshot)
  const text = snapshot.visibleText

  if (snapshot.isCommandRunning || hasRunningMarker(text)) return 'running'
  if (hasInputPrompt(snapshot)) return 'awaiting_input'
  if (lines.length >= 3) return 'stable_output'
  return 'unknown'
}

function detectMenuLike(lines: string[]): boolean {
  const optionLineCount = lines.filter((line) =>
    /^\s*(?:[>•*+-]|\[[ xX]\]|\(\s?\)|\(\*\)|\d+[.)]|[a-z][.)])\s+/.test(line)
  ).length
  const choiceWordCount = lines.filter((line) =>
    /\b(?:select|choose|option|menu|上下|选择|确认|取消)\b/i.test(line)
  ).length

  return optionLineCount >= 2 || (optionLineCount >= 1 && choiceWordCount >= 1)
}

function detectSelectedLine(snapshot: TerminalScreenSnapshot): string | undefined {
  const highlightedLine = snapshot.lines.find((line) => /^\s*(?:>|=>|[*])\s+\S/.test(line.text))
  if (highlightedLine?.text.trim()) return highlightedLine.text.trimEnd()

  const cursorLine = snapshot.lines[snapshot.cursorY]?.text.trimEnd()
  return cursorLine?.trim() ? cursorLine : undefined
}

function screenPhaseConfidence(input: {
  phase: TerminalScreenPhase
  hasProgress: boolean
  hasSpinner: boolean
  inputHints: string[]
  nonEmptyLines: string[]
}): TerminalScreenPhaseConfidence {
  if (input.phase === 'running') {
    return input.hasProgress || input.hasSpinner ? 'high' : 'medium'
  }
  if (input.phase === 'awaiting_input') {
    return input.inputHints.length > 0 ? 'high' : 'medium'
  }
  if (input.phase === 'stable_output') {
    return input.nonEmptyLines.length >= 5 ? 'high' : 'medium'
  }
  return 'low'
}

interface SessionState {
  session: TerminalSession
  stream: TerminalStream
  webContents?: WebContents
  currentCommand?: ActiveCommand
  commandQueue: TerminalCommandQueue
  screen: HeadlessTerminal
  screenWriteChain: Promise<void>
  lastScreenUpdatedAt: number
  screenHistory: TerminalScreenHistoryEntry[]
  lastScreenHash?: string
  lastScreenSnapshot?: TerminalScreenSnapshot
  lastAgentInputAt?: number
  outputBuffer: string
  rawBuffer: string
  isLocked: boolean
  lockedBy: 'agent' | 'user' | null
  paused: boolean
  takeoverMode: TerminalTakeoverMode | null
  shellIntegrationInjected: boolean
}

class CommandExecutor {
  private sessions = new TerminalStateStore<SessionState>()
  private readonly shellParser = new ShellIntegrationParser()
  private readonly history = new TerminalHistoryRecorder()
  private streamingTimers = new Map<string, NodeJS.Timeout>()

  async createSession(
    sessionId: string,
    topicId: string,
    hostId: string,
    hostAlias: string,
    stream: TerminalStream,
    webContents?: WebContents,
    autoInject = true,
    role: TerminalSessionRole = 'agent_command'
  ): Promise<TerminalSession> {
    const session: TerminalSession = {
      id: sessionId,
      topicId,
      hostId,
      hostAlias,
      role,
      status: 'active',
      shellIntegrationReady: false,
      isLocked: false,
      lockedBy: null,
      paused: false,
      takeoverMode: null,
      createdAt: Date.now()
    }

    this.history.createSession(session)

    this.sessions.set(sessionId, {
      session,
      stream,
      webContents,
      commandQueue: new TerminalCommandQueue(),
      screen: new HeadlessTerminalCtor({
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
        allowProposedApi: true,
        scrollback: 1000
      }),
      screenWriteChain: Promise.resolve(),
      lastScreenUpdatedAt: Date.now(),
      screenHistory: [],
      lastAgentInputAt: undefined,
      outputBuffer: '',
      rawBuffer: '',
      isLocked: false,
      lockedBy: null,
      paused: false,
      takeoverMode: null,
      shellIntegrationInjected: false
    })

    if (autoInject) {
      this.injectShellIntegration(stream)
    }

    return session
  }

  private syncSessionControlState(state: SessionState): void {
    state.session.isLocked = state.isLocked
    state.session.lockedBy = state.lockedBy
    state.session.paused = state.paused
    state.session.takeoverMode = state.takeoverMode
  }

  private emitControlState(state: SessionState): void {
    this.syncSessionControlState(state)
    if (!state.webContents) return
    state.webContents.send(`terminal:control-state:${state.session.id}`, {
      lockedBy: state.lockedBy,
      takeoverMode: state.takeoverMode,
      paused: state.paused
    })
  }

  private setControlState(
    state: SessionState,
    updates: {
      isLocked?: boolean
      lockedBy?: 'agent' | 'user' | null
      paused?: boolean
      takeoverMode?: TerminalTakeoverMode | null
    }
  ): void {
    if (typeof updates.isLocked === 'boolean') state.isLocked = updates.isLocked
    if (updates.lockedBy !== undefined) state.lockedBy = updates.lockedBy
    if (typeof updates.paused === 'boolean') state.paused = updates.paused
    if (updates.takeoverMode !== undefined) state.takeoverMode = updates.takeoverMode
    this.emitControlState(state)
  }

  private canAutoResumeAgent(state: SessionState): boolean {
    return (
      state.isLocked && state.lockedBy === 'user' && state.takeoverMode === 'auto' && !state.paused
    )
  }

  private releaseAutoTakeover(state: SessionState): boolean {
    if (!this.canAutoResumeAgent(state)) return false
    this.setControlState(state, {
      isLocked: false,
      lockedBy: null,
      takeoverMode: null,
      paused: false
    })
    return true
  }

  private ensureAgentCanTakeControl(state: SessionState, action: string): void {
    if (this.releaseAutoTakeover(state)) return

    if (state.isLocked && state.lockedBy === 'user') {
      if (state.paused || state.takeoverMode === 'manual') {
        throw new Error(
          'Session is under manual user takeover, resume Agent control before continuing'
        )
      }
      throw new Error(`Session is locked by user, cannot ${action}`)
    }
  }

  private shellIntegrationScript = `printf '\\x1b]6973;OPENTERM_CMD_START\\x07'; __openterm_end() { printf '\\x1b]6973;OPENTERM_CMD_END;%s;%s\\x07' "$?" "$PWD"; }; if [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='__openterm_end'; elif [ -n "$ZSH_VERSION" ]; then precmd_functions+=(__openterm_end); fi`

  injectShellIntegration(stream: TerminalStream): void {
    // Separate newline to clear current line if any
    stream.write('\n')
    // Send script without stty wrap which was causing more issues
    stream.write(this.shellIntegrationScript + '\n')
  }

  async executeAgentCommand(
    sessionId: string,
    command: string,
    topicId: string,
    taskId?: string,
    stepId?: string,
    options: CommandExecutionOptions = {}
  ): Promise<CommandResult> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      logger.error('Terminal', `Session not found for command execution: ${sessionId}`)
      throw new Error('Session not found')
    }

    return state.commandQueue.enqueue(() =>
      this._doExecuteAgentCommand(sessionId, command, topicId, taskId, stepId, options)
    )
  }

  private async _doExecuteAgentCommand(
    sessionId: string,
    command: string,
    topicId: string,
    taskId?: string,
    stepId?: string,
    options: CommandExecutionOptions = {}
  ): Promise<CommandResult> {
    logger.info('Terminal', `Executing agent command in session ${sessionId}`, { command })
    const state = this.sessions.get(sessionId)!

    this.ensureAgentCanTakeControl(state, 'execute agent command')

    this.setControlState(state, {
      isLocked: true,
      lockedBy: 'agent',
      takeoverMode: null
    })
    state.session.commandSource = 'agent'
    state.session.command = command
    state.session.commandStatus = 'running'
    state.session.commandStartTime = Date.now()

    const inputId = uuidv4()
    const input: TerminalIO = {
      id: inputId,
      sessionId,
      topicId,
      hostId: state.session.hostId,
      type: 'input',
      source: 'agent',
      content: command,
      taskId,
      stepId,
      timestamp: Date.now()
    }

    this.history.createIO(input)

    if (state.webContents) {
      state.webContents.send(`terminal:command-start:${sessionId}`, {
        inputId,
        command,
        source: 'agent'
      })
    }

    const cmdWithNewline = command.endsWith('\n') ? command : command + '\n'
    return new Promise((resolve, reject) => {
      // 1. REGISTER the active command BEFORE writing to the stream
      // This prevents race conditions where output arrives before registration
      const activeCommand: ActiveCommand = {
        inputId,
        sessionId,
        startTime: Date.now(),
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
        outputBuffer: '',
        liveOutputBuffer: '',
        isStreaming: this.isStreamingCommand(command),
        remainingEcho: cmdWithNewline,
        onOutputChunk: options.onOutputChunk
      }

      state.currentCommand = activeCommand

      const timeoutMs = Math.max(100, options.timeoutMs ?? COMMAND_TIMEOUT_MS)
      const timeout = setTimeout(() => {
        if (state.currentCommand && state.currentCommand.inputId === inputId) {
          try {
            state.stream.write('\x03')
          } catch {
            // Ignore interrupt failures; the command is still marked timed out below.
          }
          this.completeCommand(sessionId, -1, undefined, false, true)
        }
      }, timeoutMs)

      if (activeCommand.isStreaming) {
        this.startStreamingFlush(sessionId, inputId)
      }

      try {
        state.stream.write(cmdWithNewline)
      } catch (err) {
        state.currentCommand = undefined
        this.setControlState(state, { isLocked: false, lockedBy: null, takeoverMode: null })
        state.session.commandStatus = 'failed'
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  private isStreamingCommand(command: string): boolean {
    const streamingPatterns = [
      /tail\s+-f/,
      /watch\s+/,
      /^top\b/,
      /^htop\b/,
      /nvidia-smi\s+-l/,
      /dmesg\s+-w/,
      /journalctl\s+-f/,
      /kubectl\s+logs\s+-f/,
      /docker\s+logs\s+-f/,
      /less\s+/,
      /vim?\b/,
      /nano\b/,
      /cat\b.*\|\s*less/
    ]
    return streamingPatterns.some((pattern) => pattern.test(command))
  }

  private startStreamingFlush(sessionId: string, inputId: string): void {
    const timer = setInterval(() => {
      this.flushStreamingOutput(sessionId, inputId)
    }, STREAMING_FLUSH_INTERVAL_MS)

    this.streamingTimers.set(sessionId, timer)
  }

  private flushStreamingOutput(sessionId: string, inputId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentCommand) return

    const cmd = state.currentCommand
    if (cmd.outputBuffer.length === 0) return

    const chunk = cmd.outputBuffer.slice(0, STREAMING_CHUNK_SIZE)
    cmd.outputBuffer = cmd.outputBuffer.slice(STREAMING_CHUNK_SIZE)

    const outputId = uuidv4()
    const output: TerminalIO = {
      id: outputId,
      sessionId,
      topicId: state.session.topicId,
      hostId: state.session.hostId,
      type: 'output',
      source: 'system',
      content: chunk,
      relatedInputId: inputId,
      isStreaming: true,
      chunkIndex: Math.floor(Date.now() / STREAMING_FLUSH_INTERVAL_MS),
      timestamp: Date.now()
    }

    this.history.createIO(output)
  }

  handleUserInput(sessionId: string, data: string, topicId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    if (state.isLocked && state.lockedBy === 'agent') {
      this.takeoverSessionByUser(sessionId, 'auto')
      return
    }

    if (data.startsWith('\x1b')) {
      state.stream.write(data)
      return
    }

    for (const char of data) {
      if (char === '\r') {
        const command = state.outputBuffer.trim()
        if (command) {
          const inputId = uuidv4()
          const input: TerminalIO = {
            id: inputId,
            sessionId,
            topicId,
            hostId: state.session.hostId,
            type: 'input',
            source: 'user',
            content: command,
            timestamp: Date.now()
          }
          this.history.createIO(input)
          state.session.command = command
          state.session.commandSource = 'user'
          state.session.commandStatus = 'running'
          state.session.commandStartTime = Date.now()

          if (state.webContents) {
            state.webContents.send(`terminal:command-start:${sessionId}`, {
              inputId,
              command,
              source: 'user'
            })
          }

          state.currentCommand = {
            inputId,
            sessionId,
            startTime: Date.now(),
            resolve: () => {},
            reject: () => {},
            outputBuffer: '',
            liveOutputBuffer: '',
            isStreaming: false
          }
        }
        state.outputBuffer = ''
        continue
      }

      if (char === '\n' || char === '\x03' || char === '\x15') {
        state.outputBuffer = ''
        continue
      }

      if (char === '\u007f' || char === '\b') {
        state.outputBuffer = state.outputBuffer.slice(0, -1)
        continue
      }

      const code = char.charCodeAt(0)
      if (code >= 32 && code !== 127) {
        state.outputBuffer += char
      }
    }

    state.stream.write(data)
  }

  takeoverSessionByUser(sessionId: string, mode: TerminalTakeoverMode = 'auto'): boolean {
    const state = this.sessions.get(sessionId)
    if (!state) return false
    const shouldInterrupt = state.lockedBy === 'agent' || Boolean(state.currentCommand)

    if (state.currentCommand && state.lockedBy === 'agent') {
      state.currentCommand.reject(new Error('Command interrupted by user takeover'))
      state.currentCommand = undefined
    }

    const timer = this.streamingTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.streamingTimers.delete(sessionId)
    }

    this.setControlState(state, {
      isLocked: true,
      lockedBy: 'user',
      paused: mode === 'manual',
      takeoverMode: mode
    })
    if (shouldInterrupt || state.session.commandStatus === 'running') {
      state.session.commandStatus = 'failed'
    }

    if (shouldInterrupt) {
      try {
        state.stream.write('\x03')
      } catch {
        // Ignore interrupt failures; the lock state still reflects user takeover.
      }
    }

    if (state.webContents) {
      state.webContents.send(`terminal:user-takeover:${sessionId}`)
    }
    return true
  }

  handleStreamOutput(
    sessionId: string,
    data: Buffer
  ): { cleanData: string; isCommandEnd: boolean } {
    const state = this.sessions.get(sessionId)
    const textDataRaw = data.toString()
    if (!state) return { cleanData: textDataRaw, isCommandEnd: false }

    const rawChunk = data.toString()
    this.writeToScreen(state, data)
    const parsed = this.shellParser.parse(state.rawBuffer, rawChunk)
    state.rawBuffer = parsed.rawBuffer

    if (parsed.shellIntegrationReady) {
      state.session.shellIntegrationReady = true
      if (state.session.topicId) {
        this.history.updateShellIntegration(sessionId, true)
      }
    }

    // Keep only a reasonable amount of raw buffer if it becomes too large
    if (state.rawBuffer.length > RAW_BUFFER_MAX) {
      state.rawBuffer = state.rawBuffer.slice(-RAW_BUFFER_TRIM)
    }

    let cleanData = parsed.cleanData

    // Strip shell integration noise from the renderer, after preserving it for parsing.
    if (cleanData.includes('__openterm_end') || cleanData.includes('OPENTERM_CMD')) {
      // Mark as injected if not yet done
      if (!state.shellIntegrationInjected) {
        state.shellIntegrationInjected = true
      }
      // Filter out lines containing our injection artifacts
      cleanData = cleanData
        .split('\n')
        .filter((line) => {
          const s = stripAnsi(line).trim()
          return (
            s.length > 0 &&
            !s.includes('__openterm_end') &&
            !s.includes('OPENTERM_CMD') &&
            !s.includes('stty')
          )
        })
        .join('\n')
    }

    let displayData = cleanData

    // Highlight Agent command echo
    if (state.currentCommand && state.currentCommand.remainingEcho) {
      const cmd = state.currentCommand
      let matchIdx = 0
      while (
        matchIdx < displayData.length &&
        cmd.remainingEcho &&
        displayData[matchIdx] === cmd.remainingEcho[0]
      ) {
        cmd.remainingEcho = cmd.remainingEcho.slice(1)
        matchIdx++
      }

      if (matchIdx > 0) {
        const matchingPart = displayData.slice(0, matchIdx)
        const restPart = displayData.slice(matchIdx)
        // Apply Cyan color: \x1b[36m
        displayData = `\x1b[36m${matchingPart}\x1b[0m${restPart}`
      }
    }

    if (state.currentCommand) {
      // Strip ANSI for the Agent's internal buffer (clean text)
      const outputChunk = stripAnsi(cleanData)
      state.currentCommand.outputBuffer += outputChunk
      state.currentCommand.liveOutputBuffer += outputChunk
      if (outputChunk.length > 0) {
        state.currentCommand.onOutputChunk?.(outputChunk, state.currentCommand.liveOutputBuffer)
      }

      if (parsed.isCommandEnd) {
        this.completeCommand(sessionId, parsed.exitCode, parsed.cwd)
      } else if (state.currentCommand.outputBuffer.length > MAX_OUTPUT_SIZE) {
        this.completeCommand(sessionId, undefined, undefined, true)
      }
    }

    return { cleanData: displayData, isCommandEnd: parsed.isCommandEnd }
  }

  private writeToScreen(state: SessionState, data: string | Uint8Array): void {
    state.screenWriteChain = state.screenWriteChain
      .catch(() => undefined)
      .then(
        () =>
          new Promise<void>((resolve) => {
            state.screen.write(data, () => {
              state.lastScreenUpdatedAt = Date.now()
              this.recordScreenHistory(state)
              resolve()
            })
          })
      )
  }

  private async waitForScreenWrites(state: SessionState): Promise<void> {
    await state.screenWriteChain.catch((err) => {
      logger.warn('Terminal', `Headless terminal write failed: ${err}`)
    })
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    try {
      state.screen.resize(cols, rows)
      state.lastScreenUpdatedAt = Date.now()
    } catch (err) {
      logger.warn('Terminal', `Failed to resize headless terminal ${sessionId}: ${err}`)
    }
  }

  async getTerminalSnapshot(sessionId: string): Promise<TerminalScreenSnapshot> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.waitForScreenWrites(state)

    return this.captureTerminalSnapshot(state)
  }

  private captureTerminalSnapshot(state: SessionState): TerminalScreenSnapshot {
    const sessionId = state.session.id

    const activeBuffer = state.screen.buffer.active
    const lines: TerminalScreenLine[] = []

    for (let row = 0; row < state.screen.rows; row++) {
      const line = activeBuffer.getLine(activeBuffer.viewportY + row)
      lines.push({
        row,
        text: line?.translateToString(true) ?? '',
        wrapped: line?.isWrapped ?? false
      })
    }

    const visibleText = lines
      .map((line) => line.text)
      .join('\n')
      .replace(/\n+$/g, '')
    const nonEmptyLines = lines
      .map((line) => line.text.trimEnd())
      .filter((line) => line.trim().length > 0)
    const cursorLineText = lines[activeBuffer.cursorY]?.text.trimEnd() ?? ''
    const runningMarkers = progressMarkers(visibleText)
    const hasSpinner = runningMarkers.includes('spinner')
    const hasProgress = runningMarkers.includes('progress_percent')
    const baseSnapshot = {
      sessionId,
      hostId: state.session.hostId,
      hostAlias: state.session.hostAlias,
      cols: state.screen.cols,
      rows: state.screen.rows,
      cursorX: activeBuffer.cursorX,
      cursorY: activeBuffer.cursorY,
      bufferType: activeBuffer.type,
      viewportY: activeBuffer.viewportY,
      baseY: activeBuffer.baseY,
      isLocked: state.isLocked,
      lockedBy: state.lockedBy,
      isCommandRunning: Boolean(state.currentCommand),
      updatedAt: state.lastScreenUpdatedAt,
      lines,
      visibleText
    } satisfies TerminalScreenSnapshot
    const inputHints = inputPromptHints(baseSnapshot)
    const phase = classifyTerminalScreen(baseSnapshot)

    return {
      ...baseSnapshot,
      cursorLineText,
      selectedLineText: detectSelectedLine(baseSnapshot),
      nonEmptyLines,
      phase,
      phaseConfidence: screenPhaseConfidence({
        phase,
        hasProgress,
        hasSpinner,
        inputHints,
        nonEmptyLines
      }),
      inputHints,
      menuLike: detectMenuLike(nonEmptyLines),
      alternateBuffer: activeBuffer.type === 'alternate',
      hasSpinner,
      hasProgress,
      visibleTextHash: this.hashScreen(visibleText)
    }
  }

  private recordScreenHistory(state: SessionState): void {
    const snapshot = this.captureTerminalSnapshot(state)
    const hash = this.hashScreen(snapshot.visibleText)
    if (state.lastScreenHash === hash) return

    const changedLines = this.diffScreenLines(state.lastScreenSnapshot, snapshot)
    state.screenHistory.push({
      updatedAt: snapshot.updatedAt,
      hash,
      cursorX: snapshot.cursorX,
      cursorY: snapshot.cursorY,
      bufferType: snapshot.bufferType,
      cols: snapshot.cols,
      rows: snapshot.rows,
      changedLines,
      excerpt: this.buildScreenExcerpt(snapshot, changedLines)
    })

    state.lastScreenHash = hash
    state.lastScreenSnapshot = snapshot
    this.pruneScreenHistory(state)
  }

  private hashScreen(text: string): string {
    return createHash('sha1').update(text).digest('hex')
  }

  private diffScreenLines(
    previous: TerminalScreenSnapshot | undefined,
    current: TerminalScreenSnapshot
  ): TerminalChangedLine[] {
    const changed: TerminalChangedLine[] = []
    const maxRows = Math.max(previous?.lines.length ?? 0, current.lines.length)
    for (let index = 0; index < maxRows; index++) {
      const previousText = previous?.lines[index]?.text ?? ''
      const currentText = current.lines[index]?.text ?? ''
      if (previousText !== currentText) {
        changed.push({
          row: index,
          previous: previous ? previousText : undefined,
          current: currentText
        })
      }
    }
    return changed
  }

  private buildScreenExcerpt(
    snapshot: TerminalScreenSnapshot,
    changedLines: TerminalChangedLine[]
  ): string {
    const rowSet = new Set<number>()
    for (const line of changedLines.slice(-8)) {
      rowSet.add(line.row)
    }
    for (let row = snapshot.cursorY - 2; row <= snapshot.cursorY + 2; row++) {
      if (row >= 0 && row < snapshot.lines.length) rowSet.add(row)
    }
    if (rowSet.size === 0) {
      snapshot.lines.forEach((line) => {
        if (line.text.trim()) rowSet.add(line.row)
      })
    }

    return [...rowSet]
      .sort((a, b) => a - b)
      .slice(-12)
      .map((row) => {
        const line = snapshot.lines[row]
        const marker = row === snapshot.cursorY ? '>' : ' '
        return `${String(row + 1).padStart(2, '0')}${marker} ${line?.text ?? ''}`
      })
      .join('\n')
      .trimEnd()
  }

  private pruneScreenHistory(state: SessionState): void {
    const minUpdatedAt = Date.now() - SCREEN_HISTORY_TTL_MS
    state.screenHistory = state.screenHistory
      .filter((entry) => entry.updatedAt >= minUpdatedAt)
      .slice(-SCREEN_HISTORY_LIMIT)
  }

  async getTerminalHistory(
    sessionId: string,
    options: { sinceUpdatedAt?: number; maxHistory?: number } = {}
  ): Promise<TerminalScreenHistoryEntry[]> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.waitForScreenWrites(state)
    this.pruneScreenHistory(state)

    const maxHistory = Math.max(1, Math.min(options.maxHistory ?? 20, SCREEN_HISTORY_LIMIT))
    return state.screenHistory
      .filter((entry) =>
        typeof options.sinceUpdatedAt === 'number' ? entry.updatedAt > options.sinceUpdatedAt : true
      )
      .slice(-maxHistory)
  }

  async sendAgentInput(
    sessionId: string,
    data: string,
    topicId: string,
    recordedContent: string,
    taskId?: string,
    stepId?: string
  ): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    this.ensureAgentCanTakeControl(state, 'send agent input')

    const timestamp = Date.now()
    state.lastAgentInputAt = timestamp

    const input: TerminalIO = {
      id: uuidv4(),
      sessionId,
      topicId: topicId || state.session.topicId,
      hostId: state.session.hostId,
      type: 'input',
      source: 'agent',
      content: recordedContent,
      taskId,
      stepId,
      timestamp
    }
    this.history.createIO(input)

    const shouldUnlockAfterWrite = !state.isLocked
    if (shouldUnlockAfterWrite) {
      this.setControlState(state, {
        isLocked: true,
        lockedBy: 'agent',
        takeoverMode: null
      })
    }

    try {
      state.stream.write(data)
    } finally {
      if (shouldUnlockAfterWrite && !state.currentCommand) {
        this.setControlState(state, { isLocked: false, lockedBy: null, takeoverMode: null })
      }
    }
  }

  async waitForTerminalText(
    sessionId: string,
    options: WaitTerminalTextOptions,
    signal?: AbortSignal
  ): Promise<WaitTerminalTextResult> {
    const startedAt = Date.now()
    const timeoutMs = Math.max(0, options.timeoutMs)
    const stableMs = Math.max(0, options.stableMs ?? 0)
    let lastSnapshot = await this.getTerminalSnapshot(sessionId)
    let lastVisibleText = lastSnapshot.visibleText
    let stableSince = Date.now()

    while (Date.now() - startedAt <= timeoutMs) {
      if (signal?.aborted) {
        throw new Error('Terminal wait aborted')
      }

      const snapshot = await this.getTerminalSnapshot(sessionId)
      const visibleText = snapshot.visibleText
      const matched = options.text
        ? visibleText.includes(options.text)
        : Boolean(options.regex?.test(visibleText))

      if (visibleText !== lastVisibleText) {
        lastVisibleText = visibleText
        stableSince = Date.now()
      }

      lastSnapshot = snapshot

      if (matched && (stableMs === 0 || Date.now() - stableSince >= stableMs)) {
        return {
          matched: true,
          timedOut: false,
          elapsedMs: Date.now() - startedAt,
          snapshot
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return {
      matched: false,
      timedOut: true,
      elapsedMs: Date.now() - startedAt,
      snapshot: lastSnapshot
    }
  }

  async waitForTerminalActivity(
    sessionId: string,
    options: WaitTerminalActivityOptions,
    signal?: AbortSignal
  ): Promise<WaitTerminalActivityResult> {
    const startedAt = Date.now()
    const timeoutMs = Math.max(0, options.timeoutMs)
    const idleMs = Math.max(0, options.idleMs)
    const state = this.sessions.get(sessionId)
    const baselineSnapshot = await this.getTerminalSnapshot(sessionId)
    const baselineHistory = await this.getTerminalHistory(sessionId, { maxHistory: 1 })
    const baselineUpdatedAt = baselineHistory.at(-1)?.updatedAt ?? baselineSnapshot.updatedAt
    const hasStopCondition = Boolean(options.stopText || options.stopRegex)
    const baselineAfterAgentInput =
      !hasStopCondition &&
      typeof state?.lastAgentInputAt === 'number' &&
      baselineUpdatedAt >= state.lastAgentInputAt

    let sawChange = false
    let lastChangeAt = Date.now()
    let lastSnapshot = baselineSnapshot
    let historySinceBaseline: TerminalScreenHistoryEntry[] = []

    while (Date.now() - startedAt <= timeoutMs) {
      if (signal?.aborted) {
        throw new Error('Terminal activity wait aborted')
      }

      const controlState = this.getSessionControlState(sessionId)
      if (controlState?.paused && controlState.takeoverMode === 'manual') {
        throw new Error(
          'Session is under manual user takeover, resume Agent control before waiting'
        )
      }

      const snapshot = await this.getTerminalSnapshot(sessionId)
      const history = await this.getTerminalHistory(sessionId, {
        sinceUpdatedAt: baselineUpdatedAt,
        maxHistory: SCREEN_HISTORY_LIMIT
      })

      if (history.length > historySinceBaseline.length) {
        sawChange = true
        historySinceBaseline = history
        lastChangeAt = Date.now()
      }

      lastSnapshot = snapshot

      if (this.matchesTerminalActivity(snapshot, history, options)) {
        const screenPhase = classifyTerminalScreen(snapshot, history)
        return {
          status: 'matched',
          screenPhase,
          matched: true,
          timedOut: false,
          elapsedMs: Date.now() - startedAt,
          idleMs,
          snapshot,
          history: history.slice(-20)
        }
      }

      if (sawChange && Date.now() - lastChangeAt >= idleMs) {
        const screenPhase = classifyTerminalScreen(snapshot, historySinceBaseline)
        if (options.returnOnIdle === true || screenPhase !== 'running') {
          const status =
            screenPhase === 'stable_output' || screenPhase === 'awaiting_input'
              ? screenPhase
              : 'idle'
          return {
            status,
            screenPhase,
            matched: false,
            timedOut: false,
            elapsedMs: Date.now() - startedAt,
            idleMs,
            snapshot,
            history: historySinceBaseline.slice(-20)
          }
        }
      }

      if (baselineAfterAgentInput && Date.now() - baselineUpdatedAt >= idleMs) {
        const screenPhase = classifyTerminalScreen(snapshot, baselineHistory)
        if (options.returnOnIdle === true || screenPhase !== 'running') {
          const status =
            screenPhase === 'stable_output' || screenPhase === 'awaiting_input'
              ? screenPhase
              : 'idle'
          return {
            status,
            screenPhase,
            matched: false,
            timedOut: false,
            elapsedMs: Date.now() - startedAt,
            idleMs,
            snapshot,
            history: baselineHistory.slice(-20)
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, SCREEN_POLL_INTERVAL_MS))
    }

    const screenPhase = classifyTerminalScreen(lastSnapshot, historySinceBaseline)
    return {
      status: 'timeout',
      screenPhase,
      matched: false,
      timedOut: true,
      elapsedMs: Date.now() - startedAt,
      idleMs,
      snapshot: lastSnapshot,
      history: historySinceBaseline.slice(-20)
    }
  }

  private matchesTerminalActivity(
    snapshot: TerminalScreenSnapshot,
    history: TerminalScreenHistoryEntry[],
    options: WaitTerminalActivityOptions
  ): boolean {
    if (!options.stopText && !options.stopRegex) return false

    if (!options.requireFreshMatch) {
      return this.matchesText(snapshot.visibleText, options.stopText, options.stopRegex)
    }

    return history.some((entry) => {
      const changedText = entry.changedLines.map((line) => line.current).join('\n')
      return this.matchesText(
        `${changedText}\n${entry.excerpt}`,
        options.stopText,
        options.stopRegex
      )
    })
  }

  private matchesText(text: string, stopText?: string, stopRegex?: RegExp): boolean {
    if (stopText && text.includes(stopText)) return true
    if (stopRegex) {
      stopRegex.lastIndex = 0
      return stopRegex.test(text)
    }
    return false
  }

  private completeCommand(
    sessionId: string,
    exitCode?: number,
    cwd?: string,
    isTruncated = false,
    timedOut = false
  ): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentCommand) return

    const cmd = state.currentCommand
    const durationMs = Date.now() - cmd.startTime

    const timer = this.streamingTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.streamingTimers.delete(sessionId)
    }

    let outputContent = cmd.outputBuffer
    if (outputContent.length > MAX_OUTPUT_SIZE) {
      const head = outputContent.slice(0, TRUNCATION_HEAD_SIZE)
      const tail = outputContent.slice(-TRUNCATION_TAIL_SIZE)
      outputContent = `${head}\n\n... [truncated, total ${cmd.outputBuffer.length} bytes] ...\n\n${tail}`
      isTruncated = true
    }

    const outputId = uuidv4()
    const output: TerminalIO = {
      id: outputId,
      sessionId,
      topicId: state.session.topicId,
      hostId: state.session.hostId,
      type: 'output',
      source: 'system',
      content: outputContent,
      exitCode,
      durationMs,
      cwd,
      relatedInputId: cmd.inputId,
      isStreaming: cmd.isStreaming,
      isTruncated,
      timestamp: Date.now()
    }

    this.history.createIO(output)

    if (state.webContents) {
      state.webContents.send(`terminal:command-end:${sessionId}`, {
        inputId: cmd.inputId,
        outputId,
        exitCode,
        durationMs,
        isTruncated,
        cwd
      })
    }

    const result: CommandResult = {
      content: outputContent,
      exitCode: exitCode ?? -1,
      durationMs,
      isTruncated,
      sessionId,
      timedOut,
      cwd
    }

    cmd.resolve(result)

    state.currentCommand = undefined
    state.session.commandStatus = exitCode === 0 ? 'completed' : 'failed'
    state.session.commandExitCode = exitCode ?? -1
    state.session.commandDurationMs = durationMs
    if (state.lockedBy === 'agent') {
      this.setControlState(state, { isLocked: false, lockedBy: null, takeoverMode: null })
    }
  }

  async buildTerminalScreenSummary(topicId: string): Promise<string> {
    const sessions = this.history.getSessionsByTopic(topicId)
    const activeSessions = sessions.filter((session) => Boolean(this.sessions.get(session.id)))
    if (activeSessions.length === 0) return this.buildTerminalContext(topicId)

    const chunks: string[] = ['[Terminal Screen Summary]']
    for (const session of activeSessions) {
      const snapshot = await this.getTerminalSnapshot(session.id)
      const history = await this.getTerminalHistory(session.id, { maxHistory: 6 })
      const phase = classifyTerminalScreen(snapshot, history)
      const rows = this.compactSnapshotRows(snapshot)
      const recentChanges = history.slice(-3).map((entry) =>
        entry.excerpt
          .split('\n')
          .slice(-5)
          .map((line) => `    ${line}`)
          .join('\n')
      )

      chunks.push(
        [
          `${session.hostAlias} - ${session.name || 'unnamed'} (id: ${session.id})`,
          `  status: ${session.status}, phase: ${phase}, buffer: ${snapshot.bufferType}, cursor: ${snapshot.cursorX + 1},${snapshot.cursorY + 1}`,
          '  screen:',
          ...rows.map((row) => `    ${row}`),
          recentChanges.length > 0 ? '  recent changes:' : '',
          ...recentChanges
        ]
          .filter(Boolean)
          .join('\n')
      )
    }
    return chunks.join('\n\n')
  }

  private compactSnapshotRows(snapshot: TerminalScreenSnapshot): string[] {
    const rows = new Set<number>()
    snapshot.lines.forEach((line) => {
      if (line.text.trim()) rows.add(line.row)
    })
    for (let row = snapshot.cursorY - 3; row <= snapshot.cursorY + 3; row++) {
      if (row >= 0 && row < snapshot.lines.length) rows.add(row)
    }
    return [...rows]
      .sort((a, b) => a - b)
      .slice(-24)
      .map((row) => {
        const marker = row === snapshot.cursorY ? '>' : ' '
        const line = snapshot.lines[row]?.text ?? ''
        return `${String(row + 1).padStart(2, '0')}${marker} ${line}`
      })
  }

  buildTerminalContext(topicId: string): string {
    const topic = topicDB.getTopicById(topicId)
    const topicHosts = hostDB.getHosts().filter((h) => topic?.hostIds.includes(h.id))
    const sessions = this.history.getSessionsByTopic(topicId)

    let context = `\n[Topic Context]\n`
    context += `Available Hosts in this Topic:\n`
    if (topicHosts.length > 0) {
      topicHosts.forEach((h) => {
        context += `- ${h.alias} (${h.ip})\n`
      })
    } else {
      context += `- (No hosts added to this topic yet)\n`
    }

    // Add Agent Notes section
    const hostsWithNotes = topicHosts.filter((h) => h.agentNotes)
    const sessionsWithNotes = sessions.filter((s) => s.agentNotes)
    if (hostsWithNotes.length > 0 || sessionsWithNotes.length > 0) {
      context += `\n[Agent Notes]\n`
      if (hostsWithNotes.length > 0) {
        context += `Host Notes:\n`
        hostsWithNotes.forEach((h) => {
          context += `- ${h.alias}:\n${h.agentNotes
            ?.split('\n')
            .map((line) => `    ${line}`)
            .join('\n')}\n`
        })
      }
      if (sessionsWithNotes.length > 0) {
        context += `Terminal Notes:\n`
        sessionsWithNotes.forEach((s) => {
          context += `- ${s.name || 'unnamed'} (${s.hostAlias}):\n${s.agentNotes
            ?.split('\n')
            .map((line) => `    ${line}`)
            .join('\n')}\n`
        })
      }
    }

    if (sessions.length === 0) {
      context += `Active Terminals: None\n`
      return context
    }

    context += `Active Terminals:\n`
    const parts = sessions.map((session) => {
      const state = this.sessions.get(session.id)
      const recentIO = this.history.getRecentIO(session.id, 20)
      const recentCommands = recentIO
        .filter((io) => io.type === 'input')
        .slice(-5)
        .map((io) => {
          const output =
            io.type === 'input' ? this.history.getOutputByRelatedInput(io.id) : undefined
          return `  [${io.source}] ${io.content.slice(0, 50)}${io.content.length > 50 ? '...' : ''}${output ? ` → exit ${output.exitCode ?? '?'}` : ''}`
        })
        .join('\n')

      const lastAgentIO = recentIO.find((io) => io.type === 'input' && io.source === 'agent')
      const userActionsSince = lastAgentIO
        ? recentIO.filter(
            (io) =>
              io.type === 'input' && io.source === 'user' && io.timestamp > lastAgentIO.timestamp
          ).length
        : 0

      const lastOutput = recentIO.filter((io) => io.type === 'output').slice(-1)[0]
      const outputSummary = lastOutput ? lastOutput.content.slice(0, 200) : '(no output)'
      const runningOutput =
        state?.currentCommand?.liveOutputBuffer || state?.currentCommand?.outputBuffer
      const runningSummary = runningOutput ? runningOutput.slice(-300).replace(/\n/g, '\n    ') : ''

      const lockStatus = state && state.isLocked ? `, locked by ${state.lockedBy}` : ''

      return (
        `${session.hostAlias} - ${session.name || 'unnamed'} (id: ${session.id}):\n` +
        `  status: ${session.status}${lockStatus}\n` +
        `  recent commands:\n${recentCommands || '    (none)'}\n` +
        (state?.currentCommand
          ? `  running command inputId: ${state.currentCommand.inputId}\n` +
            (runningSummary ? `  live output tail:\n    ${runningSummary}\n` : '')
          : '') +
        `  last output: ${outputSummary.slice(0, 100)}${outputSummary.length > 100 ? '...' : ''}\n` +
        (userActionsSince > 0
          ? `  ⚠️ user typed ${userActionsSince} command(s) since last agent operation\n`
          : '')
      )
    })

    context += `📋 Terminal State Summary:\n${parts.join('\n\n')}`
    return context
  }

  setSessionLock(sessionId: string, locked: boolean, lockedBy: 'agent' | 'user' | null): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      if ((!locked || lockedBy === 'user') && state.currentCommand && state.lockedBy === 'agent') {
        state.currentCommand.reject(new Error('Command interrupted by user takeover'))
        state.currentCommand = undefined
      }

      if (!locked && state.paused) {
        this.setControlState(state, {
          isLocked: true,
          lockedBy: 'user',
          paused: true,
          takeoverMode: 'manual'
        })
        return
      }

      if (!locked && state.takeoverMode === 'auto' && state.lockedBy === 'user') {
        this.setControlState(state, {
          isLocked: false,
          lockedBy: null,
          takeoverMode: null,
          paused: false
        })
        return
      }

      this.setControlState(state, {
        isLocked: locked,
        lockedBy,
        takeoverMode: lockedBy === 'user' ? state.takeoverMode : null
      })
    }
  }

  isSessionLocked(sessionId: string): { locked: boolean; lockedBy: 'agent' | 'user' | null } {
    const state = this.sessions.get(sessionId)
    if (!state) return { locked: false, lockedBy: null }
    return { locked: state.isLocked, lockedBy: state.lockedBy }
  }

  isSessionIdle(sessionId: string): boolean {
    const state = this.sessions.get(sessionId)
    if (!state) return false
    return state.session.status === 'active' && !state.currentCommand && !state.isLocked
  }

  canAcceptAgentCommand(sessionId: string): { ok: boolean; reason?: string } {
    const state = this.sessions.get(sessionId)
    if (!state) return { ok: false, reason: 'session_not_found' }
    if (state.session.status !== 'active') return { ok: false, reason: 'session_not_active' }
    if (state.currentCommand) return { ok: false, reason: 'command_running' }
    if (state.paused) return { ok: false, reason: 'manual_pause' }
    if (state.isLocked) return { ok: false, reason: `locked_by_${state.lockedBy || 'unknown'}` }
    const bufferType = state.screen.buffer.active.type === 'alternate' ? 'alternate' : 'normal'
    if (bufferType === 'alternate') return { ok: false, reason: 'alternate_buffer' }
    return { ok: true }
  }

  setSessionPaused(sessionId: string, paused: boolean): boolean {
    const state = this.sessions.get(sessionId)
    if (!state) return false

    if (paused) {
      return this.takeoverSessionByUser(sessionId, 'manual')
    }

    this.setControlState(state, {
      isLocked: false,
      lockedBy: null,
      paused: false,
      takeoverMode: null
    })
    return true
  }

  getSessionControlState(sessionId: string):
    | {
        isLocked: boolean
        lockedBy: 'agent' | 'user' | null
        paused: boolean
        takeoverMode: TerminalTakeoverMode | null
      }
    | undefined {
    const state = this.sessions.get(sessionId)
    if (!state) return undefined
    return {
      isLocked: state.isLocked,
      lockedBy: state.lockedBy,
      paused: state.paused,
      takeoverMode: state.takeoverMode
    }
  }

  attachSession(sessionId: string, webContents: WebContents): boolean {
    const state = this.sessions.get(sessionId)
    if (!state) return false
    state.webContents = webContents
    return true
  }

  closeSessionsByTopic(topicId: string): void {
    logger.info('Terminal', `Closing all sessions for topic: ${topicId}`)
    const sessionsToClose = this.sessions.values().filter((s) => s.session.topicId === topicId)

    for (const state of sessionsToClose) {
      this.closeSession(state.session.id)
    }
  }

  closeSession(sessionId: string, deletedBy: TerminalSessionDeletedBy = 'agent'): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      if (state.currentCommand) {
        state.currentCommand.reject(new Error('Session closed'))
      }

      state.screen.dispose()

      const timer = this.streamingTimers.get(sessionId)
      if (timer) {
        clearInterval(timer)
        this.streamingTimers.delete(sessionId)
      }

      if (state.session.topicId) {
        this.history.closeSession(sessionId, deletedBy)
      }
      this.sessions.delete(sessionId)

      if (state.webContents) {
        state.webContents.send(`terminal:session-closed:${sessionId}`)
      }
    }
  }

  getSessionState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)
  }

  async execute(
    sessionId: string,
    command: string,
    topicId?: string,
    taskId?: string,
    stepId?: string,
    options: CommandExecutionOptions = {}
  ): Promise<CommandResult> {
    return this.executeAgentCommand(sessionId, command, topicId || '', taskId, stepId, options)
  }
}

export const commandExecutor = new CommandExecutor()
