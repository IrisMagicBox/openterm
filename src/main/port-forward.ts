import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import { hostDB } from './db'
import { logger } from './logger'
import { v4 as uuidv4 } from 'uuid'
import { buildSSHConfig } from './utils/ssh-config'

interface ForwardTunnel {
  id: string
  hostId: string
  client: Client
  localPort: number
  remoteHost: string
  remotePort: number
  status: 'active' | 'closed'
  createdAt: number
}

const tunnels = new Map<string, ForwardTunnel>()

function getHostConfig(hostId: string) {
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

    client
      .on('ready', () => {
        client.forwardOut('127.0.0.1', localPort, remoteHost, remotePort, (err, stream) => {
          if (err) {
            client.end()
            reject(new Error(`Port forward failed: ${err.message}`))
            return
          }

          const tunnel: ForwardTunnel = {
            id: uuidv4(),
            hostId,
            client,
            localPort,
            remoteHost,
            remotePort,
            status: 'active',
            createdAt: Date.now()
          }

          stream
            .on('close', () => {
              tunnel.status = 'closed'
              tunnels.delete(tunnel.id)
              client.end()
            })
            .on('error', (err: Error) => {
              logger.error('PortForward', `Stream error: ${err.message}`)
              tunnel.status = 'closed'
              tunnels.delete(tunnel.id)
              client.end()
            })

          tunnels.set(tunnel.id, tunnel)
          resolve(tunnel)
        })
      })
      .on('error', reject)
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
        client.forwardIn(remoteHost, remotePort, (err, _port) => {
          if (err) {
            client.end()
            reject(new Error(`Local forward failed: ${err.message}`))
            return
          }

          const tunnel: ForwardTunnel = {
            id: uuidv4(),
            hostId,
            client,
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

  tunnel.status = 'closed'
  tunnel.client.end()
  tunnels.delete(tunnelId)
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
