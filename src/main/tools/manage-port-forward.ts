import { z } from 'zod'
import { closeTunnel, createForwardTunnel, listTunnels, type ForwardTunnel } from '../port-forward'
import { resolveHostId } from '../utils/host-resolver'
import { define, Tool } from './tool-factory'

const portSchema = z.number().int().min(1).max(65535)

const parameters = z.object({
  action: z.enum(['list', 'create', 'close']).describe('操作类型'),
  hostId: z.string().optional().describe('主机ID。create 时必填；list 时可选'),
  localPort: portSchema.optional().describe('本地端口。create 时可选，默认使用 remotePort'),
  remoteHost: z.string().optional().describe('远端服务地址。create 时默认 127.0.0.1'),
  remotePort: portSchema.optional().describe('远端服务端口。create 时必填'),
  tunnelId: z.string().optional().describe('隧道ID。close 时必填'),
  reason: z.string().optional().describe('执行端口转发操作的原因')
})

function serializeTunnel(tunnel: ForwardTunnel): Record<string, unknown> {
  return {
    id: tunnel.id,
    hostId: tunnel.hostId,
    localPort: tunnel.localPort,
    remoteHost: tunnel.remoteHost,
    remotePort: tunnel.remotePort,
    status: tunnel.status,
    createdAt: tunnel.createdAt,
    localhostUrl: `http://127.0.0.1:${tunnel.localPort}`
  }
}

export default define('manage_port_forward', {
  description:
    '管理当前工作台的 SSH 端口转发。可列出、创建或关闭 tunnel。发现远程 Web 服务端口时可建议创建转发；创建前必须说明原因并等待用户审批。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { action } = args

    if (action === 'list') {
      const host = args.hostId ? resolveHostId(args.hostId) : undefined
      if (args.hostId && !host) return { output: `Error: Host ${args.hostId} not found.` }

      return {
        output: JSON.stringify({
          tunnels: listTunnels(host?.id).map(serializeTunnel)
        })
      }
    }

    if (action === 'close') {
      if (!args.tunnelId) return { output: 'Error: tunnelId is required for close.' }
      const closed = closeTunnel(args.tunnelId)
      return {
        output: JSON.stringify({
          tunnelId: args.tunnelId,
          closed
        })
      }
    }

    if (!args.hostId) return { output: 'Error: hostId is required for create.' }
    if (!args.remotePort) return { output: 'Error: remotePort is required for create.' }

    const host = resolveHostId(args.hostId)
    if (!host) return { output: `Error: Host ${args.hostId} not found.` }

    const remoteHost = args.remoteHost || '127.0.0.1'
    const localPort = args.localPort || args.remotePort
    const pattern = `port-forward ${host.alias} 127.0.0.1:${localPort} -> ${remoteHost}:${args.remotePort}`
    const metadata = {
      riskCategory: 'network',
      commandPattern: pattern,
      requiresVerification: false
    }

    const approval = await ctx.requestAuthorization(
      pattern,
      'medium',
      args.reason || `创建 ${host.alias} 的端口转发`,
      metadata
    )
    if (!approval.approved) {
      return { output: 'Error: User rejected port-forward authorization', metadata }
    }

    const tunnel = await createForwardTunnel(host.id, localPort, remoteHost, args.remotePort)
    const serialized = serializeTunnel(tunnel)
    return {
      output: JSON.stringify({
        message: 'Port forward created',
        tunnel: serialized
      }),
      metadata: {
        ...metadata,
        tunnelId: tunnel.id,
        hostId: host.id,
        localPort,
        remoteHost,
        remotePort: args.remotePort,
        localhostUrl: serialized.localhostUrl
      }
    }
  }
})
