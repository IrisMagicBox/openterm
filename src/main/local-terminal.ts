import { ipcMain, WebContents } from 'electron'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { terminalSessionDB } from './db'
import { TerminalSession } from '../shared/types'
import { getErrorMessage } from '../shared/errors'
import { v4 as uuidv4 } from 'uuid'
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
  isAgentSession?: boolean
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

        // IMPORTANT: Use localSession.webContents instead of webContents from the closure
        if (localSession.webContents) {
          localSession.webContents.send(`ssh:data:${sessionId}`, result.cleanData)
        }
      })

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        logger.info('LocalTerminal', `Local PTY exited with code ${exitCode}`)
        sessions.delete(sessionId)
        if (topicId && topicId !== '') {
          terminalSessionDB.closeSession(sessionId)
        }
        if (webContents) {
          webContents.send(`ssh:closed:${sessionId}`)
        }
      })

      commandExecutor.createSession(
        sessionId,
        topicId,
        'local',
        '本地终端',
        ptyProcess,
        webContents,
        false
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

  // Detect user input during agent execution
  if (fromUser && session.isAgentExecuting && !session.agentPaused) {
    logger.warn(
      'LocalTerminal',
      `User input detected while agent is executing in session ${sessionId}`
    )

    // Pause the agent session
    session.agentPaused = true
    commandExecutor.setSessionLock(sessionId, true, 'user')

    // Notify the renderer that user has taken over
    if (session.webContents) {
      session.webContents.send(`terminal:user-takeover:${sessionId}`)
    }
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
  } catch (_) {
    /* PTY resize fails silently if process exited */
  }
}

export function getLocalSessionBuffer(sessionId: string): string {
  const session = sessions.get(sessionId)
  return session ? session.buffer.slice(-TERMINAL_BUFFER_SIZE) : ''
}

export function closeLocalSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    session.pty.kill()
  } catch (_) {
    /* PTY kill fails silently if already exited */
  }

  commandExecutor.closeSession(sessionId)
  sessions.delete(sessionId)
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
  ipcMain.handle('local:connect', async (_, topicId: string) => {
    const sessionId = uuidv4()
    return await createLocalSession(sessionId, topicId)
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
    closeLocalSession(sessionId)
    return true
  })
}
