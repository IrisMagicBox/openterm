import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { normalizeHostId } from '../utils/host-resolver'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  alias: z.string().optional().describe('新别名'),
  tags: z.array(z.string()).optional().describe('新标签列表')
})

export default define('manage_host', {
  description:
    '管理主机元数据（更新别名、标签）。当你通过执行命令探测到主机角色（如 Redis Master）时，主动更新主机别名或添加标签。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, alias, tags } = args
    const normalizedHostId = normalizeHostId(hostId)
    await ctx.agentService.updateHostMetadata(normalizedHostId, {
      alias,
      tags
    })
    return {
      output: JSON.stringify({ message: 'Host metadata updated', hostId: normalizedHostId })
    }
  }
})
