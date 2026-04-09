import { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import { TerminalSession, TerminalIO, CommandResult } from '../shared/types'
import { terminalSessionDB, terminalIODB } from './db'

interface ActiveCommand {
  inputId: string
  sessionId: string
  startTime: number
  resolve: (result: CommandResult) => void
  reject: (error: Error) => void
  outputBuffer: string
  isStreaming: boolean
  remainingEcho?: string
}

interface SessionState {
  session: TerminalSession
  stream: any
  webContents?: WebContents
  currentCommand?: ActiveCommand
  outputBuffer: string
  rawBuffer: string
  isLocked: boolean
  lockedBy: 'agent' | 'user' | null
}

const OSC_START = '\x1b]6973;OPENTERM_CMD_START\x07'
const OSC_END_PREFIX = '\x1b]6973;OPENTERM_CMD_END;'
const MAX_OUTPUT_SIZE = 50000
const STREAMING_CHUNK_SIZE = 10000
const STREAMING_FLUSH_INTERVAL = 5000

class CommandExecutor {
  private sessions = new Map<string, SessionState>()
  private streamingTimers = new Map<string, NodeJS.Timeout>()

  async createSession(
    sessionId: string,
    topicId: string,
    hostId: string,
    hostAlias: string,
    stream: any,
    webContents?: WebContents
  ): Promise<TerminalSession> {
    const session: TerminalSession = {
      id: sessionId,
      topicId,
      hostId,
      hostAlias,
      status: 'active',
      shellIntegrationReady: false,
      createdAt: Date.now()
    }

    terminalSessionDB.createSession(session)

    this.sessions.set(sessionId, {
      session,
      stream,
      webContents,
      outputBuffer: '',
      rawBuffer: '',
      isLocked: false,
      lockedBy: null
    })

    this.injectShellIntegration(stream)

    return session
  }

  private injectShellIntegration(stream: any): void {
    const bashScript = `__openterm_end() { printf '\\x1b]6973;OPENTERM_CMD_END;%s\\x07' "$?"; }; if [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='__openterm_end'; elif [ -n "$ZSH_VERSION" ]; then precmd_functions+=(__openterm_end); fi`.trim()

    stream.write(bashScript + '\n')
  }

  async executeAgentCommand(
    sessionId: string,
    command: string,
    topicId: string,
    taskId?: string,
    stepId?: string
  ): Promise<CommandResult> {
    logger.info('Terminal', `Executing agent command in session ${sessionId}`, { command })
    const state = this.sessions.get(sessionId)
    if (!state) {
      logger.error('Terminal', `Session not found for command execution: ${sessionId}`)
      throw new Error('Session not found')
    }

    if (state.isLocked && state.lockedBy === 'user') {
      throw new Error('Session is locked by user, cannot execute agent command')
    }

    state.isLocked = true
    state.lockedBy = 'agent'

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

    terminalIODB.createIO(input)

    if (state.webContents) {
      state.webContents.send(`terminal:command-start:${sessionId}`, {
        inputId,
        command,
        source: 'agent'
      })
    }

    const cmdWithNewline = command.endsWith('\n') ? command : command + '\n'
    try {
      state.stream.write(cmdWithNewline)
    } catch (err) {
      state.isLocked = false
      state.lockedBy = null
      throw err
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (state.currentCommand && state.currentCommand.inputId === inputId) {
          this.completeCommand(sessionId, -1, true)
          reject(new Error('Command execution timed out after 60 seconds'))
        }
      }, 60000)

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
        isStreaming: this.isStreamingCommand(command),
        remainingEcho: cmdWithNewline
      }

      state.currentCommand = activeCommand

      if (activeCommand.isStreaming) {
        this.startStreamingFlush(sessionId, inputId)
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
    }, STREAMING_FLUSH_INTERVAL)

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
      chunkIndex: Math.floor(Date.now() / STREAMING_FLUSH_INTERVAL),
      timestamp: Date.now()
    }

    terminalIODB.createIO(output)
  }

  handleUserInput(sessionId: string, data: string, topicId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    if (state.isLocked && state.lockedBy === 'agent') {
      // Always allow Ctrl+C (Interrupt) even if locked by agent
      if (data === '\x03') {
        state.stream.write(data)
      }
      return
    }

    if (data === '\r') {
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
        terminalIODB.createIO(input)

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
          isStreaming: false
        }
      }
      state.outputBuffer = ''
    } else if (data === '\u007f') {
      state.outputBuffer = state.outputBuffer.slice(0, -1)
    } else if (data >= ' ' && data !== '\u007f') {
      state.outputBuffer += data
    }

    state.stream.write(data)
  }

  handleStreamOutput(
    sessionId: string,
    data: Buffer
  ): { cleanData: string; isCommandEnd: boolean } {
    const state = this.sessions.get(sessionId)
    if (!state) return { cleanData: data.toString(), isCommandEnd: false }

    state.rawBuffer += data.toString()
    let isCommandEnd = false
    let exitCode: number | undefined

    if (state.rawBuffer.includes(OSC_START)) {
      state.session.shellIntegrationReady = true
      terminalSessionDB.updateSessionShellIntegration(sessionId, true)
      state.rawBuffer = state.rawBuffer.replace(new RegExp(OSC_START, 'g'), '')
    }

    const endRegex = new RegExp(`${OSC_END_PREFIX}(-?\\d+)\\x07`)
    const endMatch = state.rawBuffer.match(endRegex)
    if (endMatch) {
      exitCode = parseInt(endMatch[1], 10)
      isCommandEnd = true
      state.rawBuffer = state.rawBuffer.replace(endRegex, '')
    }

    // Keep only a reasonable amount of raw buffer if it becomes too large
    if (state.rawBuffer.length > 1000) {
      state.rawBuffer = state.rawBuffer.slice(-500)
    }

    const cleanData = data.toString()
      .replace(new RegExp(OSC_START, 'g'), '')
      .replace(new RegExp(`${OSC_END_PREFIX}(-?\\d+)\\x07`, 'g'), '')

    let displayData = cleanData

    // Highlight Agent command echo
    if (state.currentCommand && state.currentCommand.remainingEcho) {
      const cmd = state.currentCommand
      let matchIdx = 0
      while (matchIdx < displayData.length && cmd.remainingEcho && displayData[matchIdx] === cmd.remainingEcho[0]) {
        cmd.remainingEcho = cmd.remainingEcho.slice(1)
        matchIdx++
      }

      if (matchIdx > 0) {
        const matchingPart = displayData.slice(0, matchIdx)
        const restPart = displayData.slice(matchIdx)
        // Apply Light Blue color: \x1b[38;2;99;128;254m
        displayData = `\x1b[38;2;99;128;254m${matchingPart}\x1b[0m${restPart}`
      }
    }

    if (state.currentCommand) {
      state.currentCommand.outputBuffer += cleanData

      if (isCommandEnd) {
        this.completeCommand(sessionId, exitCode)
      } else if (state.currentCommand.outputBuffer.length > MAX_OUTPUT_SIZE) {
        this.completeCommand(sessionId, undefined, true)
      }
    }

    return { cleanData: displayData, isCommandEnd }
  }

  private completeCommand(sessionId: string, exitCode?: number, isTruncated = false): void {
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
      const head = outputContent.slice(0, 30000)
      const tail = outputContent.slice(-20000)
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
      relatedInputId: cmd.inputId,
      isStreaming: cmd.isStreaming,
      isTruncated,
      timestamp: Date.now()
    }

    terminalIODB.createIO(output)

    if (state.webContents) {
      state.webContents.send(`terminal:command-end:${sessionId}`, {
        inputId: cmd.inputId,
        outputId,
        exitCode,
        durationMs,
        isTruncated
      })
    }

    const result: CommandResult = {
      content: outputContent,
      exitCode: exitCode ?? -1,
      durationMs,
      isTruncated,
      sessionId
    }

    cmd.resolve(result)

    state.currentCommand = undefined
    if (state.lockedBy === 'agent') {
      state.isLocked = false
      state.lockedBy = null
    }
  }

  buildTerminalContext(topicId: string): string {
    const sessions = terminalSessionDB.getSessionsByTopic(topicId)
    if (sessions.length === 0) return ''

    const parts = sessions.map((session) => {
      const state = this.sessions.get(session.id)
      const recentIO = terminalIODB.getIOBySession(session.id, 20)
      const recentCommands = recentIO
        .filter((io) => io.type === 'input')
        .slice(-5)
        .map((io) => {
          const output =
            io.type === 'input' ? terminalIODB.getOutputByRelatedInput(io.id) : undefined
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

      const lockStatus = state && state.isLocked ? `, locked by ${state.lockedBy}` : ''

      return (
        `${session.hostAlias} (session ${session.id.slice(0, 8)}):\n` +
        `  status: ${session.status}${lockStatus}\n` +
        `  recent commands:\n${recentCommands || '    (none)'}\n` +
        `  last output: ${outputSummary.slice(0, 100)}${outputSummary.length > 100 ? '...' : ''}\n` +
        (userActionsSince > 0
          ? `  ⚠️ user typed ${userActionsSince} command(s) since last agent operation\n`
          : '')
      )
    })

    return `📋 Terminal State Summary:\n${parts.join('\n\n')}`
  }

  setSessionLock(sessionId: string, locked: boolean, lockedBy: 'agent' | 'user' | null): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      if ((!locked || lockedBy === 'user') && state.currentCommand && state.lockedBy === 'agent') {
        state.currentCommand.reject(new Error('Command interrupted by user takeover'))
        state.currentCommand = undefined
      }
      state.isLocked = locked
      state.lockedBy = lockedBy
    }
  }

  isSessionLocked(sessionId: string): { locked: boolean; lockedBy: 'agent' | 'user' | null } {
    const state = this.sessions.get(sessionId)
    if (!state) return { locked: false, lockedBy: null }
    return { locked: state.isLocked, lockedBy: state.lockedBy }
  }

  attachSession(sessionId: string, webContents: WebContents): boolean {
    const state = this.sessions.get(sessionId)
    if (!state) return false
    state.webContents = webContents
    return true
  }

  closeSession(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      if (state.currentCommand) {
        state.currentCommand.reject(new Error('Session closed'))
      }

      const timer = this.streamingTimers.get(sessionId)
      if (timer) {
        clearInterval(timer)
        this.streamingTimers.delete(sessionId)
      }

      terminalSessionDB.closeSession(sessionId)
      this.sessions.delete(sessionId)
    }
  }

  getSessionState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)
  }
}

export const commandExecutor = new CommandExecutor()
