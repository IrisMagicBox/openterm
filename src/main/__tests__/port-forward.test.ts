import * as net from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  forwardOut: vi.fn(),
  ipcHandle: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle
  }
}))

vi.mock('ssh2', () => {
  type Handler = (...args: unknown[]) => void

  class MockClient {
    private handlers = new Map<string, Handler[]>()

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    connect(): this {
      queueMicrotask(() => this.emit('ready'))
      return this
    }

    end(): void {
      this.emit('close')
    }

    forwardOut(...args: unknown[]): void {
      mocks.forwardOut(...args)
    }

    private emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args)
      }
    }
  }

  return { Client: MockClient }
})

vi.mock('../db', () => ({
  hostDB: {
    getHostById: vi.fn(() => ({
      id: 'host-1',
      alias: 'Remote',
      ip: '127.0.0.1',
      port: 22,
      username: 'tester',
      tags: [],
      createdAt: 1
    }))
  }
}))

vi.mock('../logger', () => ({
  logger: mocks.logger
}))

vi.mock('../utils/ssh-config', () => ({
  buildSSHConfig: vi.fn(() => ({
    host: '127.0.0.1',
    port: 22,
    username: 'tester'
  }))
}))

import { closeTunnel, createForwardTunnel, type ForwardTunnel } from '../port-forward'

const openTunnels: ForwardTunnel[] = []

afterEach(() => {
  for (const tunnel of openTunnels.splice(0)) {
    closeTunnel(tunnel.id)
  }
  vi.clearAllMocks()
})

describe('createForwardTunnel', () => {
  it('closes the local socket without throwing when the remote channel is refused', async () => {
    mocks.forwardOut.mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1)
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(new Error('(SSH) Channel open failure: Connection refused')))
      }
    })

    const tunnel = await createForwardTunnel('host-1', 0, '127.0.0.1', 8080)
    openTunnels.push(tunnel)

    const address = tunnel.server?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected the local forwarding server to be listening')
    }

    const localSocket = net.createConnection({ host: '127.0.0.1', port: address.port })
    localSocket.on('error', () => {})

    await new Promise<void>((resolve) => {
      localSocket.on('close', resolve)
    })

    expect(mocks.forwardOut).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      '127.0.0.1',
      8080,
      expect.any(Function)
    )
    expect(tunnel.status).toBe('active')
    expect(tunnel.sockets.size).toBe(0)
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'PortForward',
      'forwardOut error: (SSH) Channel open failure: Connection refused'
    )
  })
})
