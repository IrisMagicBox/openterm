import { Client } from 'ssh2'
import { ipcMain, WebContents } from 'electron'
import { hostDB } from './db'
import { commandExecutor } from './terminal'
import { TERMINAL_BUFFER_SIZE, SSH_RAW_BUFFER_MAX, SSH_RAW_BUFFER_TRIM } from './constants'
import { buildSSHConfig, type SSHConnectionConfig } from './utils/ssh-config'
import type {
  Host,
  TerminalSessionDeletedBy,
  TerminalSessionRole,
  TerminalStream
} from '../shared/types'

interface SSHSession {
  client: Client
  stream: TerminalStream | null
  hostId: string
  webContents?: WebContents
  buffer: string
  isAgentSession?: boolean
  commandResolve?: (value: string) => void
  currentOutput: string
}

const sessions = new Map<string, SSHSession>()

function generateSessionId(hostId: string): string {
  return `${hostId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getHostAndConfig(hostId: string): { host: Host; config: SSHConnectionConfig } {
  const host = hostDB.getHostById(hostId)
  if (!host) throw new Error('Host not found')

  const config = buildSSHConfig(host)

  return { host, config }
}

function getConnectionConfig(hostId: string): { config: SSHConnectionConfig } {
  const { config } = getHostAndConfig(hostId)
  return { config }
}

export const executeSSHCommand = (hostId: string, command: string): Promise<string> => {
  const { config } = getConnectionConfig(hostId)

  const client = new Client()
  return new Promise((resolve, reject) => {
    client
      .on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            client.end()
            return reject(err)
          }
          let output = ''
          stream
            .on('data', (data: Buffer) => {
              output += data.toString()
            })
            .on('close', () => {
              client.end()
              resolve(output)
            })
            .stderr.on('data', (data: Buffer) => {
              output += data.toString()
            })
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .connect(config)
  })
}

export const getTerminalBuffer = (sessionId: string): string => {
  const session = sessions.get(sessionId)
  return session ? session.buffer.slice(-TERMINAL_BUFFER_SIZE) : ''
}

export const setAgentSessionPaused = (sessionId: string, paused: boolean): boolean => {
  return commandExecutor.setSessionPaused(sessionId, paused)
}

export const isAgentSessionPaused = (sessionId: string): boolean => {
  return commandExecutor.getSessionControlState(sessionId)?.paused ?? false
}

export const executeAgentCommand = async (
  sessionId: string,
  command: string,
  _webContents?: WebContents,
  topicId?: string,
  taskId?: string,
  stepId?: string
): Promise<{ content: string; exitCode: number; durationMs: number }> => {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const effectiveTopicId = topicId || 'unknown'

  const result = await commandExecutor.executeAgentCommand(
    sessionId,
    command,
    effectiveTopicId,
    taskId,
    stepId
  )

  return {
    content: result.content,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  }
}

export const createAgentSession = (
  hostId: string,
  webContents: WebContents,
  topicId?: string,
  role: TerminalSessionRole = 'agent_command',
  existingSessionId?: string
): Promise<string> => {
  const { host, config } = getHostAndConfig(hostId)

  return new Promise((resolve, reject) => {
    const client = new Client()

    client
      .on('ready', () => {
        client.shell((err, stream) => {
          if (err) {
            client.end()
            return reject(err)
          }

          const sessionId = existingSessionId || generateSessionId(hostId)
          const session: SSHSession = {
            client,
            stream: stream as unknown as TerminalStream,
            hostId,
            webContents,
            buffer: '',
            isAgentSession: true,
            currentOutput: ''
          }
          sessions.set(sessionId, session)

          if (topicId) {
            commandExecutor.createSession(
              sessionId,
              topicId,
              hostId,
              host.alias,
              stream,
              webContents,
              true,
              role
            )
          }

          stream.on('data', (data: Buffer) => {
            const { cleanData } = commandExecutor.handleStreamOutput(sessionId, data)

            const str = data.toString()
            session.buffer += str
            session.currentOutput += str

            if (session.buffer.length > SSH_RAW_BUFFER_MAX) {
              session.buffer = session.buffer.slice(-SSH_RAW_BUFFER_TRIM)
            }

            session.webContents?.send(`ssh:data:${sessionId}`, cleanData)
          })

          stream.on('close', () => {
            commandExecutor.closeSession(sessionId, 'system')
            sessions.delete(sessionId)
            session.webContents?.send(`ssh:closed:${sessionId}`)
            client.end()
          })

          session.webContents?.send(`ssh:ready:${sessionId}`, host.alias)
          resolve(sessionId)
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .connect(config)
  })
}

export const hasSSHSession = (sessionId: string): boolean => sessions.has(sessionId)

export const attachSSHSession = (sessionId: string, webContents: WebContents): boolean => {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.webContents = webContents
  commandExecutor.attachSession(sessionId, webContents)
  return true
}

export const closeSession = (
  sessionId: string,
  deletedBy: TerminalSessionDeletedBy = 'agent'
): boolean => {
  const session = sessions.get(sessionId)
  if (session) {
    commandExecutor.closeSession(sessionId, deletedBy)
    session.stream?.close()
    session.client.end()
    sessions.delete(sessionId)
    return true
  }
  return false
}

export const sendSSHInput = (sessionId: string, data: string, topicId?: string): boolean => {
  const session = sessions.get(sessionId)
  if (!session?.stream) return false
  if (topicId) {
    commandExecutor.handleUserInput(sessionId, data, topicId)
  } else {
    session.stream.write(data)
  }
  return true
}

export const resizeSSHSession = (sessionId: string, cols: number, rows: number): boolean => {
  const session = sessions.get(sessionId)
  if (!session?.stream) return false
  session.stream.setWindow(rows, cols, 0, 0)
  commandExecutor.resizeSession(sessionId, cols, rows)
  return true
}

import { AgentSession } from './agent'

let agentServiceRef: { registerSession(session: AgentSession): void } | null = null

export function setAgentService(
  service: { registerSession(session: AgentSession): void } | null
): void {
  agentServiceRef = service
}

export function setupSSHHandlers(): void {
  ipcMain.removeHandler('ssh:connect')
  ipcMain.handle('ssh:connect', async (event, hostId: string, topicId: string) => {
    const webContents = event.sender
    const { host, config } = getHostAndConfig(hostId)

    const client = new Client()

    return new Promise((resolve, reject) => {
      client
        .on('ready', () => {
          client.shell((err, stream) => {
            if (err) {
              client.end()
              return reject(err)
            }

            const sessionId = generateSessionId(hostId)
            const session: SSHSession = {
              client,
              stream: stream as unknown as TerminalStream,
              hostId,
              webContents,
              buffer: '',
              currentOutput: ''
            }
            sessions.set(sessionId, session)

            // Register with commandExecutor for Agent usage if topic is provided
            if (topicId) {
              commandExecutor.createSession(
                sessionId,
                topicId,
                hostId,
                host.alias,
                stream,
                webContents,
                true,
                'user'
              )

              if (agentServiceRef) {
                agentServiceRef.registerSession({
                  id: sessionId,
                  topicId,
                  hostId,
                  hostAlias: host.alias,
                  role: 'user',
                  name: `${host.alias} Terminal`,
                  status: 'active',
                  shellIntegrationReady: false,
                  isPinned: false,
                  visible: true,
                  paused: false,
                  createdAt: Date.now()
                })
              }
            }

            stream.on('data', (data: Buffer) => {
              // Use handleStreamOutput if it's registered in commandExecutor
              const { cleanData } = topicId
                ? commandExecutor.handleStreamOutput(sessionId, data)
                : { cleanData: data.toString() }

              const currentSession = sessions.get(sessionId)
              if (currentSession) {
                currentSession.buffer += data.toString()
                currentSession.currentOutput += data.toString()
              }
              currentSession?.webContents?.send(`ssh:data:${sessionId}`, cleanData)
            })

            stream.on('close', () => {
              if (topicId) commandExecutor.closeSession(sessionId, 'system')
              sessions.delete(sessionId)
              session?.webContents?.send(`ssh:closed:${sessionId}`)
              client.end()
            })

            resolve(sessionId)
          })
        })
        .on('error', (err) => {
          reject(err)
        })
        .connect(config)
    })
  })

  ipcMain.removeHandler('ssh:agent:create')
  ipcMain.handle(
    'ssh:agent:create',
    async (event, hostId: string, topicId?: string, role?: TerminalSessionRole) => {
      return createAgentSession(hostId, event.sender, topicId, role)
    }
  )

  ipcMain.removeHandler('ssh:agent:execute')
  ipcMain.handle(
    'ssh:agent:execute',
    async (
      event,
      sessionId: string,
      command: string,
      topicId?: string,
      taskId?: string,
      stepId?: string
    ) => {
      return executeAgentCommand(sessionId, command, event.sender, topicId, taskId, stepId)
    }
  )

  ipcMain.removeHandler('ssh:agent:buffer')
  ipcMain.handle('ssh:agent:buffer', (_, sessionId: string) => {
    const session = sessions.get(sessionId)
    return session ? session.currentOutput : ''
  })

  ipcMain.removeHandler('ssh:agent:close')
  ipcMain.handle('ssh:agent:close', (_, sessionId: string) => {
    closeSession(sessionId, 'agent')
  })

  ipcMain.removeHandler('ssh:agent:set-paused')
  ipcMain.handle('ssh:agent:set-paused', (_, sessionId: string, paused: boolean) => {
    return setAgentSessionPaused(sessionId, paused)
  })

  ipcMain.removeHandler('ssh:agent:is-paused')
  ipcMain.handle('ssh:agent:is-paused', (_, sessionId: string) => {
    return isAgentSessionPaused(sessionId)
  })

  ipcMain.removeHandler('ssh:get-buffer')
  ipcMain.handle('ssh:get-buffer', (_, sessionId: string) => {
    return getTerminalBuffer(sessionId)
  })

  ipcMain.removeAllListeners('ssh:attach')
  ipcMain.on('ssh:attach', (event, sessionId: string) => {
    attachSSHSession(sessionId, event.sender)
  })

  ipcMain.removeAllListeners('ssh:input')
  ipcMain.on('ssh:input', (_, sessionId: string, data: string, topicId?: string) => {
    sendSSHInput(sessionId, data, topicId)
  })

  ipcMain.removeAllListeners('ssh:resize')
  ipcMain.on('ssh:resize', (_, sessionId: string, cols: number, rows: number) => {
    resizeSSHSession(sessionId, cols, rows)
  })
}
