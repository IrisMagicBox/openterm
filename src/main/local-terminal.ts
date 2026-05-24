import { ipcMain, WebContents } from 'electron'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { TerminalSession, TerminalSessionDeletedBy, TerminalSessionRole } from '../shared/types'
import { getErrorMessage } from '../shared/errors'
import { v4 as uuidv4 } from 'uuid'
import type { AgentSession } from './agent'
import {
  LOCAL_BUFFER_MAX,
  LOCAL_BUFFER_TRIM,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  TERMINAL_BUFFER_SIZE
} from './constants'

interface LocalPtySession {
  id: string
  pty: any
  hostId: string
  topicId: string
  webContents?: WebContents
  buffer: string
  isAgentSession?: boolean
  agentPaused?: boolean
  agentPauseWaiters?: Array<() => void>
  isAgentExecuting?: boolean
}

const sessions = new Map<string, LocalPtySession>()
let agentServiceRef: {
  registerSession(session: AgentSession): void | Promise<void>
  notifyTerminalClosed?(sessionId: string): void
} | null = null

export function setLocalAgentService(
  service: {
    registerSession(session: AgentSession): void | Promise<void>
    notifyTerminalClosed?(sessionId: string): void
  } | null
): void {
  agentServiceRef = service
}

let ptyModule: any = null
async function getPty(): Promise<any> {
  if (ptyModule) return ptyModule
  try {
    ptyModule = await import('node-pty')
    return ptyModule
  } catch (err) {
    logger.error(
      'LocalTerminal',
      'node-pty is not installed. Local terminal support requires node-pty.'
    )
    throw new Error('node-pty is not installed. Please install it with: npm install node-pty')
  }
}

export function createLocalSession(
  sessionId: string,
  topicId: string,
  webContents?: WebContents,
  isAgentSession?: boolean,
  role: TerminalSessionRole = isAgentSession ? 'agent_command' : 'user'
): Promise<TerminalSession> {
  return new Promise(async (resolve, reject) => {
    try {
      const nodePty = await getPty()
      const shell =
        process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'

      const ptyProcess = nodePty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
        cwd: process.env.HOME,
        env: { ...process.env } as Record<string, string>
      })

      const session: TerminalSession = {
        id: sessionId,
        topicId,
        hostId: 'local',
        hostAlias: '本地终端',
        role,
        status: 'active',
        shellIntegrationReady: false,
        createdAt: Date.now()
      }

      const localSession: LocalPtySession = {
        id: sessionId,
        pty: ptyProcess,
        hostId: 'local',
        topicId,
        webContents,
        buffer: '',
        isAgentSession
      }

      ptyProcess.onData((data: string) => {
        localSession.buffer += data
        if (localSession.buffer.length > LOCAL_BUFFER_MAX) {
          localSession.buffer = localSession.buffer.slice(-LOCAL_BUFFER_TRIM)
        }

        const result = commandExecutor.handleStreamOutput(sessionId, Buffer.from(data))
        logger.debug('LocalTerminal', 'local pty data', {
          sessionId,
          rawLength: data.length,
          displayLength: result.displayData.length
        })

        // IMPORTANT: Use localSession.webContents instead of webContents from the closure
        if (localSession.webContents) {
          localSession.webContents.send(`ssh:data:${sessionId}`, result.displayData)
        }
      })

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        logger.info('LocalTerminal', `Local PTY exited with code ${exitCode}`)
        sessions.delete(sessionId)
        if (topicId && topicId !== '') {
          commandExecutor.closeSession(sessionId, 'system')
          agentServiceRef?.notifyTerminalClosed?.(sessionId)
        }
        if (localSession.webContents) {
          localSession.webContents.send(`ssh:closed:${sessionId}`)
        }
      })

      commandExecutor.createSession(
        sessionId,
        topicId,
        'local',
        '本地终端',
        ptyProcess,
        webContents,
        true,
        role
      )

      sessions.set(sessionId, localSession)
      resolve(session)
    } catch (err: unknown) {
      logger.error('LocalTerminal', `Failed to create local session: ${getErrorMessage(err)}`)
      reject(err)
    }
  })
}

export function setLocalSessionAgentExecuting(sessionId: string, executing: boolean): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.isAgentExecuting = executing
    if (session.webContents) {
      session.webContents.send(`terminal:agent-executing:${sessionId}`, executing)
    }
  }
}

export function isLocalSessionAgentExecuting(sessionId: string): boolean {
  return sessions.get(sessionId)?.isAgentExecuting ?? false
}

export function sendLocalInput(sessionId: string, data: string, fromUser = true): void {
  const session = sessions.get(sessionId)
  if (!session) {
    logger.error('LocalTerminal', `sendLocalInput: session not found ${sessionId}`)
    return
  }

  if (fromUser) {
    const handled = commandExecutor.handleUserInput(sessionId, data, session.topicId)
    if (!handled) {
      try {
        session.pty.write(data)
        logger.warn(
          'LocalTerminal',
          `command executor missed user input; wrote ${data.length} bytes directly`
        )
      } catch (err) {
        logger.error('LocalTerminal', `sendLocalInput fallback write error: ${err}`)
      }
    }
    return
  }

  try {
    session.pty.write(data)
    logger.info('LocalTerminal', `sendLocalInput wrote ${data.length} bytes`)
  } catch (err) {
    logger.error('LocalTerminal', `sendLocalInput write error: ${err}`)
  }
}

export function resizeLocalTerminal(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    session.pty.resize(cols, rows)
    commandExecutor.resizeSession(sessionId, cols, rows)
  } catch (_) {
    /* PTY resize fails silently if process exited */
  }
}

export function getLocalSessionBuffer(sessionId: string): string {
  const session = sessions.get(sessionId)
  return session ? session.buffer.slice(-TERMINAL_BUFFER_SIZE) : ''
}

export function hasLocalSession(sessionId: string): boolean {
  return sessions.has(sessionId)
}

export function closeLocalSession(
  sessionId: string,
  deletedBy: TerminalSessionDeletedBy = 'agent'
): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  try {
    session.pty.kill()
  } catch (_) {
    /* PTY kill fails silently if already exited */
  }

  commandExecutor.closeSession(sessionId, deletedBy)
  sessions.delete(sessionId)
  return true
}

export function attachLocalSession(sessionId: string, webContents: WebContents): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  session.webContents = webContents
  commandExecutor.attachSession(sessionId, webContents)
  return true
}

export function registerLocalTerminalIPC(): void {
  ipcMain.removeHandler('local:connect')
  ipcMain.handle('local:connect', async (event, topicId: string) => {
    const sessionId = uuidv4()
    const session = await createLocalSession(sessionId, topicId, event.sender)
    if (topicId) {
      await agentServiceRef?.registerSession({
        ...session,
        role: 'user',
        name: session.name || '本地终端',
        visible: true,
        paused: false,
        takeoverMode: null
      })
    }
    return session
  })

  ipcMain.on('local:input', (event, sessionId: string, data: string) => {
    logger.info(
      'LocalTerminal',
      `IPC RECEIVED [local:input] session=${sessionId}, len=${data.length}, data=${JSON.stringify(data)}`
    )
    const fromUser = event.sender.id !== 0
    sendLocalInput(sessionId, data, fromUser)
  })

  ipcMain.on('local:resize', (_, sessionId: string, cols: number, rows: number) => {
    resizeLocalTerminal(sessionId, cols, rows)
  })

  ipcMain.removeHandler('local:get-buffer')
  ipcMain.handle('local:get-buffer', (_, sessionId: string) => {
    return getLocalSessionBuffer(sessionId)
  })

  ipcMain.on('local:attach', (event, sessionId: string) => {
    attachLocalSession(sessionId, event.sender)
  })

  ipcMain.removeHandler('local:close')
  ipcMain.handle('local:close', (_, sessionId: string) => {
    closeLocalSession(sessionId, 'user')
    return true
  })
}
