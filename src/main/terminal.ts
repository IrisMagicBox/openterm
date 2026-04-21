import { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import { TerminalSession, TerminalIO, CommandResult, TerminalStream } from '../shared/types'
import { terminalSessionDB, terminalIODB, topicDB, hostDB } from './db'
import {
  MAX_OUTPUT_SIZE,
  STREAMING_CHUNK_SIZE,
  STREAMING_FLUSH_INTERVAL_MS,
  COMMAND_TIMEOUT_MS,
  RAW_BUFFER_MAX,
  RAW_BUFFER_TRIM,
  TRUNCATION_HEAD_SIZE,
  TRUNCATION_TAIL_SIZE
} from './constants'

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
  stream: TerminalStream
  webContents?: WebContents
  currentCommand?: ActiveCommand
  commandQueue: Promise<void>
  outputBuffer: string
  rawBuffer: string
  isLocked: boolean
  lockedBy: 'agent' | 'user' | null
  shellIntegrationInjected: boolean
}

const OSC_START = '\x1b]6973;OPENTERM_CMD_START\x07'
const OSC_END_PREFIX = '\x1b]6973;OPENTERM_CMD_END;'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function makeOscStartRegex(): RegExp {
  return new RegExp(escapeRegExp(OSC_START), 'g')
}

function makeOscEndRegex(): RegExp {
  return new RegExp(`${escapeRegExp(OSC_END_PREFIX)}(-?\\d+);([^\\x07]*)\\x07`, 'g')
}

function stripAnsi(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 27 && text[i + 1] === '[') {
      i += 2
      while (i < text.length && !/[a-zA-Z]/.test(text[i])) {
        i++
      }
      continue
    }
    result += text[i]
  }
  return result
}

class CommandExecutor {
  private sessions = new Map<string, SessionState>()
  private streamingTimers = new Map<string, NodeJS.Timeout>()

  async createSession(
    sessionId: string,
    topicId: string,
    hostId: string,
    hostAlias: string,
    stream: TerminalStream,
    webContents?: WebContents,
    autoInject = true
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

    if (topicId) {
      terminalSessionDB.createSession(session)
    }

    this.sessions.set(sessionId, {
      session,
      stream,
      webContents,
      commandQueue: Promise.resolve(),
      outputBuffer: '',
      rawBuffer: '',
      isLocked: false,
      lockedBy: null,
      shellIntegrationInjected: false
    })

    if (autoInject) {
      this.injectShellIntegration(stream)
    }

    return session
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
    stepId?: string
  ): Promise<CommandResult> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      logger.error('Terminal', `Session not found for command execution: ${sessionId}`)
      throw new Error('Session not found')
    }

    // Capture the promise for this specific command and chain it to the session queue
    const commandPromise = state.commandQueue.then(async () => {
      return this._doExecuteAgentCommand(sessionId, command, topicId, taskId, stepId)
    })

    // Update the queue to wait for this command (don't let errors break the queue)
    state.commandQueue = commandPromise.then(
      () => {},
      () => {}
    )

    return commandPromise
  }

  private async _doExecuteAgentCommand(
    sessionId: string,
    command: string,
    topicId: string,
    taskId?: string,
    stepId?: string
  ): Promise<CommandResult> {
    logger.info('Terminal', `Executing agent command in session ${sessionId}`, { command })
    const state = this.sessions.get(sessionId)!

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
        isStreaming: this.isStreamingCommand(command),
        remainingEcho: cmdWithNewline
      }

      state.currentCommand = activeCommand

      const timeout = setTimeout(() => {
        if (state.currentCommand && state.currentCommand.inputId === inputId) {
          this.completeCommand(sessionId, -1, '', true)
          reject(
            new Error(`Command execution timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds`)
          )
        }
      }, COMMAND_TIMEOUT_MS)

      if (activeCommand.isStreaming) {
        this.startStreamingFlush(sessionId, inputId)
      }

      try {
        state.stream.write(cmdWithNewline)
      } catch (err) {
        state.currentCommand = undefined
        state.isLocked = false
        state.lockedBy = null
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
    const textDataRaw = data.toString()
    if (!state) return { cleanData: textDataRaw, isCommandEnd: false }

    const rawChunk = data.toString()

    state.rawBuffer += rawChunk
    let isCommandEnd = false
    let exitCode: number | undefined
    let cwd: string | undefined

    if (state.rawBuffer.includes(OSC_START)) {
      state.session.shellIntegrationReady = true
      if (state.session.topicId) {
        terminalSessionDB.updateSessionShellIntegration(sessionId, true)
      }
      state.rawBuffer = state.rawBuffer.replace(makeOscStartRegex(), '')
    }

    const endRegex = makeOscEndRegex()
    let endMatch: RegExpExecArray | null
    while ((endMatch = endRegex.exec(state.rawBuffer)) !== null) {
      exitCode = parseInt(endMatch[1], 10)
      cwd = endMatch[2]
      isCommandEnd = true
    }
    if (isCommandEnd) {
      state.rawBuffer = state.rawBuffer.replace(makeOscEndRegex(), '')
    }

    // Keep only a reasonable amount of raw buffer if it becomes too large
    if (state.rawBuffer.length > RAW_BUFFER_MAX) {
      state.rawBuffer = state.rawBuffer.slice(-RAW_BUFFER_TRIM)
    }

    let cleanData = rawChunk.replace(makeOscStartRegex(), '').replace(makeOscEndRegex(), '')

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
      state.currentCommand.outputBuffer += stripAnsi(cleanData)

      if (isCommandEnd) {
        this.completeCommand(sessionId, exitCode, cwd)
      } else if (state.currentCommand.outputBuffer.length > MAX_OUTPUT_SIZE) {
        this.completeCommand(sessionId, undefined, undefined, true)
      }
    }

    return { cleanData: displayData, isCommandEnd }
  }

  private completeCommand(
    sessionId: string,
    exitCode?: number,
    cwd?: string,
    isTruncated = false
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

    terminalIODB.createIO(output)

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
      cwd
    }

    cmd.resolve(result)

    state.currentCommand = undefined
    if (state.lockedBy === 'agent') {
      state.isLocked = false
      state.lockedBy = null
    }
  }

  buildTerminalContext(topicId: string): string {
    const topic = topicDB.getTopicById(topicId)
    const topicHosts = hostDB.getHosts().filter((h) => topic?.hostIds.includes(h.id))
    const sessions = terminalSessionDB.getSessionsByTopic(topicId)

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
        `${session.hostAlias} - ${session.name || 'unnamed'} (id: ${session.id}):\n` +
        `  status: ${session.status}${lockStatus}\n` +
        `  recent commands:\n${recentCommands || '    (none)'}\n` +
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

  closeSessionsByTopic(topicId: string): void {
    logger.info('Terminal', `Closing all sessions for topic: ${topicId}`)
    const sessionsToClose = Array.from(this.sessions.values()).filter(
      (s) => s.session.topicId === topicId
    )

    for (const state of sessionsToClose) {
      this.closeSession(state.session.id)
    }
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

      if (state.session.topicId) {
        terminalSessionDB.closeSession(sessionId)
        terminalIODB.markIOAsDeletedBySession(sessionId, Date.now(), 'agent')
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
    stepId?: string
  ): Promise<CommandResult> {
    return this.executeAgentCommand(sessionId, command, topicId || '', taskId, stepId)
  }
}

export const commandExecutor = new CommandExecutor()
