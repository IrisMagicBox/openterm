import { Client } from 'ssh2'
import { ipcMain, WebContents } from 'electron'
import { hostDB } from './db'
import { commandExecutor } from './terminal'
import { readFileSync } from 'fs'

interface SSHSession {
  client: Client
  stream: any
  hostId: string
  buffer: string
  isAgentSession?: boolean
  commandResolve?: (value: string) => void
  currentOutput: string
  agentPaused?: boolean
  agentPauseWaiters?: Array<() => void>
}

const sessions = new Map<string, SSHSession>()

function generateSessionId(hostId: string): string {
  return `${hostId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getHostAndConfig(hostId: string) {
  const host = hostDB.getHostById(hostId)
  if (!host) throw new Error('Host not found')

  const config: any = {
    host: host.ip,
    port: host.port || 22,
    username: host.username
  }

  if (host.keyPath) {
    try {
      config.privateKey = readFileSync(host.keyPath)
    } catch (err) {
      if (host.password) config.password = host.password
    }
  } else if (host.password) {
    config.password = host.password
  }

  return { host, config }
}

function getConnectionConfig(hostId: string) {
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
  return session ? session.buffer.slice(-2000) : ''
}

const waitForAgentResume = (session: SSHSession): Promise<void> => {
  if (!session.agentPaused) return Promise.resolve()

  return new Promise((resolve) => {
    if (!session.agentPauseWaiters) {
      session.agentPauseWaiters = []
    }
    session.agentPauseWaiters.push(resolve)
  })
}

export const setAgentSessionPaused = (sessionId: string, paused: boolean): boolean => {
  const session = sessions.get(sessionId)
  if (!session || !session.isAgentSession) return false

  session.agentPaused = paused
  commandExecutor.setSessionLock(sessionId, paused, paused ? 'user' : null)

  if (paused && session.stream) {
    // Interrupt the current foreground command so the user can take over immediately.
    session.stream.write('\x03')
  }

  if (!paused && session.agentPauseWaiters?.length) {
    const waiters = [...session.agentPauseWaiters]
    session.agentPauseWaiters = []
    waiters.forEach((resolve) => resolve())
  }
  return true
}

export const isAgentSessionPaused = (sessionId: string): boolean => {
  const session = sessions.get(sessionId)
  return Boolean(session?.agentPaused)
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

  await waitForAgentResume(session)

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
  topicId?: string
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

          const sessionId = generateSessionId(hostId)
          const session: SSHSession = {
            client,
            stream,
            hostId,
            buffer: '',
            isAgentSession: true,
            currentOutput: '',
            agentPaused: false,
            agentPauseWaiters: []
          }
          sessions.set(sessionId, session)

          if (topicId) {
            commandExecutor.createSession(
              sessionId,
              topicId,
              hostId,
              host.alias,
              stream,
              webContents
            )
          }

          stream.on('data', (data: Buffer) => {
            const { cleanData } = commandExecutor.handleStreamOutput(sessionId, data)

            const str = data.toString()
            session.buffer += str
            session.currentOutput += str

            if (session.buffer.length > 10000) {
              session.buffer = session.buffer.slice(-5000)
            }

            webContents.send(`ssh:data:${sessionId}`, cleanData)
          })

          stream.on('close', () => {
            commandExecutor.closeSession(sessionId)
            sessions.delete(sessionId)
            webContents.send(`ssh:closed:${sessionId}`)
            client.end()
          })

          webContents.send(`ssh:ready:${sessionId}`, host.alias)
          resolve(sessionId)
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .connect(config)
  })
}

export const closeSession = (sessionId: string): void => {
  const session = sessions.get(sessionId)
  if (session) {
    commandExecutor.closeSession(sessionId)
    session.stream.close()
    session.client.end()
    sessions.delete(sessionId)
  }
}

let agentServiceRef: any = null

export function setAgentService(service: any) {
  agentServiceRef = service
}

export function setupSSHHandlers() {

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
            sessions.set(sessionId, { client, stream, hostId, buffer: '', currentOutput: '' })

            // Register with commandExecutor for Agent usage if topic is provided
            if (topicId) {
              commandExecutor.createSession(
                sessionId,
                topicId,
                hostId,
                host.alias,
                stream,
                webContents
              )

              if (agentServiceRef) {
                agentServiceRef.registerSession({
                  id: sessionId,
                  topicId,
                  hostId,
                  hostAlias: host.alias,
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

              const session = sessions.get(sessionId)
              if (session) {
                session.buffer += data.toString()
                session.currentOutput += data.toString()
              }
              webContents.send(`ssh:data:${sessionId}`, cleanData)
            })

            stream.on('close', () => {
              if (topicId) commandExecutor.closeSession(sessionId)
              sessions.delete(sessionId)
              webContents.send(`ssh:closed:${sessionId}`)
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
  ipcMain.handle('ssh:agent:create', async (event, hostId: string, topicId?: string) => {
    return createAgentSession(hostId, event.sender, topicId)
  })

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
    closeSession(sessionId)
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
    commandExecutor.attachSession(sessionId, event.sender)
  })

  ipcMain.removeAllListeners('ssh:input')
  ipcMain.on('ssh:input', (_, sessionId: string, data: string, topicId?: string) => {
    const session = sessions.get(sessionId)
    if (session && session.stream) {
      if (topicId) {
        commandExecutor.handleUserInput(sessionId, data, topicId)
      } else {
        session.stream.write(data)
      }
    }
  })

  ipcMain.removeAllListeners('ssh:resize')
  ipcMain.on('ssh:resize', (_, sessionId: string, cols: number, rows: number) => {
    const session = sessions.get(sessionId)
    if (session && session.stream) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
  })
}
