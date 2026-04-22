import { describe, expect, it, vi } from 'vitest'
import managePortForwardTool from '../manage-port-forward'
import type { Tool } from '../tool-factory'

vi.mock('../../port-forward', () => ({
  listTunnels: vi.fn(() => []),
  closeTunnel: vi.fn(() => false),
  createForwardTunnel: vi.fn()
}))

vi.mock('../../utils/host-resolver', () => ({
  resolveHostId: vi.fn(() => undefined)
}))

describe('manage_port_forward tool', () => {
  it('lists tunnels without requiring host arguments', async () => {
    const tool = await managePortForwardTool.init()
    const result = await tool.execute({ action: 'list' }, {} as Tool.Context)
    expect(JSON.parse(result.output)).toEqual({ tunnels: [] })
  })

  it('validates create arguments before creating a tunnel', async () => {
    const tool = await managePortForwardTool.init()
    const result = await tool.execute({ action: 'create', hostId: 'host-1' }, {} as Tool.Context)
    expect(result.output).toContain('remotePort is required')
  })

  it('rejects invalid port values through schema validation', async () => {
    const tool = await managePortForwardTool.init()
    await expect(
      tool.execute({ action: 'create', localPort: 70000 } as never, {} as Tool.Context)
    ).rejects.toThrow(/invalid arguments/i)
  })

  it('closes unknown tunnels as a no-op result', async () => {
    const tool = await managePortForwardTool.init()
    const result = await tool.execute({ action: 'close', tunnelId: 'missing' }, {} as Tool.Context)
    expect(JSON.parse(result.output)).toEqual({ tunnelId: 'missing', closed: false })
  })
})
