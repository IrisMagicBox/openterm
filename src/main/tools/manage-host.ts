import type { ToolHandler, ToolContext, ToolResult } from './types'
import { normalizeHostId } from '../utils/host-resolver'

const manageHostHandler: ToolHandler = {
  name: 'manage_host',
  definition: {
    type: 'function',
    function: {
      name: 'manage_host',
      description:
        '管理主机元数据（更新别名、标签）。当你通过执行命令探测到主机角色（如 Redis Master）时，主动更新主机别名或添加标签。',
      parameters: {
        type: 'object',
        properties: {
          hostId: { type: 'string', description: '主机ID' },
          alias: { type: 'string', description: '新别名' },
          tags: { type: 'array', items: { type: 'string' }, description: '新标签列表' }
        },
        required: ['hostId']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const hostId = args.hostId as string
    const alias = args.alias as string | undefined
    const tags = args.tags as string[] | undefined
    const normalizedHostId = normalizeHostId(hostId)
    await ctx.agentService.updateHostMetadata(normalizedHostId, {
      alias: alias as string | undefined,
      tags: tags as string[] | undefined
    })
    return { message: 'Host metadata updated', hostId: normalizedHostId }
  }
}

export default manageHostHandler
