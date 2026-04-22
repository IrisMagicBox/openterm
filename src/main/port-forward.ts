import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import * as net from 'net'
import { hostDB } from './db'
import { logger } from './logger'
import { v4 as uuidv4 } from 'uuid'
import { buildSSHConfig } from './utils/ssh-config'
import type { SSHConnectionConfig } from './utils/ssh-config'
import type { Host } from '../shared/types'

export interface ForwardTunnel {
  id: string
  hostId: string
  client: Client
  server?: net.Server
  sockets: Set<net.Socket>
  localPort: number
  remoteHost: string
  remotePort: number
  status: 'active' | 'closed'
  createdAt: number
}

const tunnels = new Map<string, ForwardTunnel>()

function closeTunnelResources(tunnel: ForwardTunnel): void {
  if (tunnel.status === 'closed') return

  tunnel.status = 'closed'
  for (const socket of tunnel.sockets) {
    socket.destroy()
  }
  tunnel.sockets.clear()
  if (tunnel.server?.listening) {
    tunnel.server.close()
  }
  tunnel.client.end()
  tunnels.delete(tunnel.id)
}

function getHostConfig(hostId: string): { host: Host; config: SSHConnectionConfig } {
  const host = hostDB.getHostById(hostId)
  if (!host) throw new Error('Host not found')

  const config = buildSSHConfig(host)

  return { host, config }
}

export async function createForwardTunnel(
  hostId: string,
  localPort: number,
  remoteHost: string,
  remotePort: number
): Promise<ForwardTunnel> {
  const { config } = getHostConfig(hostId)

  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false
    const tunnel: ForwardTunnel = {
      id: uuidv4(),
      hostId,
      client,
      sockets: new Set(),
      localPort,
      remoteHost,
      remotePort,
      status: 'active',
      createdAt: Date.now()
    }

    client
      .on('ready', () => {
        const server = net.createServer((socket) => {
          tunnel.sockets.add(socket)

          client.forwardOut(
            socket.remoteAddress || '127.0.0.1',
            socket.remotePort || 0,
            remoteHost,
            remotePort,
            (err, stream) => {
              if (err) {
                logger.error('PortForward', `forwardOut error: ${err.message}`)
                socket.destroy(err)
                return
              }

              socket.pipe(stream).pipe(socket)

              const cleanup = (): void => {
                tunnel.sockets.delete(socket)
                socket.destroy()
                stream.destroy()
              }

              socket.on('close', cleanup).on('error', cleanup)
              stream.on('close', cleanup).on('error', (streamErr: Error) => {
                logger.error('PortForward', `Stream error: ${streamErr.message}`)
                cleanup()
              })
            }
          )
        })

        tunnel.server = server

        server
          .on('error', (err: Error) => {
            if (!settled) {
              settled = true
              client.end()
              reject(new Error(`Local port listen failed: ${err.message}`))
              return
            }
            logger.error('PortForward', `Server error: ${err.message}`)
            closeTunnelResources(tunnel)
          })
          .on('close', () => {
            if (tunnel.status !== 'closed') {
              closeTunnelResources(tunnel)
            }
          })
          .listen(localPort, '127.0.0.1', () => {
            settled = true
            tunnels.set(tunnel.id, tunnel)
            logger.info(
              'PortForward',
              `Listening on 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}`
            )
            resolve(tunnel)
          })
      })
      .on('error', (err) => {
        if (!settled) {
          settled = true
          reject(err)
          return
        }
        logger.error('PortForward', `SSH client error: ${err.message}`)
        closeTunnelResources(tunnel)
      })
      .on('close', () => {
        if (tunnel.status !== 'closed') {
          closeTunnelResources(tunnel)
        }
      })
      .connect(config)
  })
}

export function createLocalForward(
  hostId: string,
  localPort: number,
  remoteHost: string,
  remotePort: number
): Promise<ForwardTunnel> {
  const { config } = getHostConfig(hostId)

  return new Promise((resolve, reject) => {
    const client = new Client()

    client
      .on('ready', () => {
        client.forwardIn(remoteHost, remotePort, (err) => {
          if (err) {
            client.end()
            reject(new Error(`Local forward failed: ${err.message}`))
            return
          }

          const tunnel: ForwardTunnel = {
            id: uuidv4(),
            hostId,
            client,
            sockets: new Set(),
            localPort,
            remoteHost,
            remotePort,
            status: 'active',
            createdAt: Date.now()
          }

          tunnels.set(tunnel.id, tunnel)
          resolve(tunnel)
        })
      })
      .on('error', reject)
      .connect(config)
  })
}

export function closeTunnel(tunnelId: string): boolean {
  const tunnel = tunnels.get(tunnelId)
  if (!tunnel) return false

  closeTunnelResources(tunnel)
  return true
}

export function listTunnels(hostId?: string): ForwardTunnel[] {
  const all = Array.from(tunnels.values())
  if (hostId) return all.filter((t) => t.hostId === hostId)
  return all
}

export function registerPortForwardIPC(): void {
  ipcMain.handle(
    'pf:create',
    async (_, hostId: string, localPort: number, remoteHost: string, remotePort: number) => {
      const tunnel = await createForwardTunnel(hostId, localPort, remoteHost, remotePort)
      return {
        id: tunnel.id,
        hostId: tunnel.hostId,
        localPort: tunnel.localPort,
        remoteHost: tunnel.remoteHost,
        remotePort: tunnel.remotePort,
        status: tunnel.status,
        createdAt: tunnel.createdAt
      }
    }
  )

  ipcMain.handle('pf:close', (_, tunnelId: string) => closeTunnel(tunnelId))

  ipcMain.handle('pf:list', (_, hostId?: string) => {
    return listTunnels(hostId).map((t) => ({
      id: t.id,
      hostId: t.hostId,
      localPort: t.localPort,
      remoteHost: t.remoteHost,
      remotePort: t.remotePort,
      status: t.status,
      createdAt: t.createdAt
    }))
  })
}
