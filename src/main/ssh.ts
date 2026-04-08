import { Client } from 'ssh2'
import { ipcMain, WebContents } from 'electron'
import { hostDB } from './db'
import { readFileSync } from 'fs'

interface SSHSession {
  client: Client
  stream: any
  hostId: string
  buffer: string // Store some history for the agent to "see"
  isAgentSession?: boolean // Mark if this is an agent-controlled session
  commandResolve?: (value: string) => void // Promise resolver for command completion
  currentOutput: string // Accumulate current command output
  agentPaused?: boolean
  agentPauseWaiters?: Array<() => void>
}

const sessions = new Map<string, SSHSession>()

// Generate a unique session ID
function generateSessionId(hostId: string): string {
  return `${hostId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Get connection config for a host
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
      console.warn('Failed to read SSH key, falling back to password:', err)
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

// Legacy: Execute a single command (non-interactive)
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

// Execute command in an agent session (interactive shell mode)
export const executeAgentCommand = (
  sessionId: string,
  command: string,
  webContents?: WebContents
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('Session not found'))
      return
    }

    waitForAgentResume(session)
      .then(() => {
        session.currentOutput = ''
        session.commandResolve = resolve

        const cmdWithNewline = command.endsWith('\n') ? command : command + '\n'
        session.stream.write(cmdWithNewline)

        if (webContents) {
          webContents.send(`ssh:command:${sessionId}`, command)
        }

        setTimeout(() => {
          if (session.commandResolve) {
            const output = session.currentOutput
            session.currentOutput = ''
            session.commandResolve = undefined
            resolve(output)
          }
        }, 500)
      })
      .catch(reject)
  })
}

export const createAgentSession = (hostId: string, webContents: WebContents): Promise<string> => {
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

          stream.on('data', (data: Buffer) => {
            const str = data.toString()
            session.buffer += str
            session.currentOutput += str

            // Keep buffer size manageable
            if (session.buffer.length > 10000) {
              session.buffer = session.buffer.slice(-5000)
            }

            // Send to renderer for display
            webContents.send(`ssh:data:${sessionId}`, str)
          })

          stream.on('close', () => {
            sessions.delete(sessionId)
            webContents.send(`ssh:closed:${sessionId}`)
            client.end()
          })

          // Send initial ready signal
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

// Close a session
export const closeSession = (sessionId: string): void => {
  const session = sessions.get(sessionId)
  if (session) {
    session.stream.close()
    session.client.end()
    sessions.delete(sessionId)
  }
}

export function setupSSHHandlers() {
  ipcMain.removeHandler('ssh:connect')
  ipcMain.handle('ssh:connect', async (event, hostId: string) => {
    const webContents = event.sender
    const { config } = getConnectionConfig(hostId)

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

            stream.on('data', (data: Buffer) => {
              const str = data.toString()
              const session = sessions.get(sessionId)
              if (session) session.buffer += str
              webContents.send(`ssh:data:${sessionId}`, str)
            })

            stream.on('close', () => {
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

  // Agent session creation
  ipcMain.removeHandler('ssh:agent:create')
  ipcMain.handle('ssh:agent:create', async (event, hostId: string) => {
    return createAgentSession(hostId, event.sender)
  })

  // Agent command execution (interactive)
  ipcMain.removeHandler('ssh:agent:execute')
  ipcMain.handle('ssh:agent:execute', async (event, sessionId: string, command: string) => {
    return executeAgentCommand(sessionId, command, event.sender)
  })

  // Get session output buffer
  ipcMain.removeHandler('ssh:agent:buffer')
  ipcMain.handle('ssh:agent:buffer', (_, sessionId: string) => {
    const session = sessions.get(sessionId)
    return session ? session.currentOutput : ''
  })

  // Close agent session
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

  // SSH input
  ipcMain.removeAllListeners('ssh:input')
  ipcMain.on('ssh:input', (_, sessionId: string, data: string) => {
    const session = sessions.get(sessionId)
    if (session && session.stream) {
      session.stream.write(data)
    }
  })

  // SSH resize
  ipcMain.removeAllListeners('ssh:resize')
  ipcMain.on('ssh:resize', (_, sessionId: string, cols: number, rows: number) => {
    const session = sessions.get(sessionId)
    if (session && session.stream) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
  })
}
