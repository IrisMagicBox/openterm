import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { normalizeHostId } from '../utils/host-resolver'

const parameters = z.object({
  query: z.string().describe('搜索关键词'),
  hostId: z.string().optional().describe('限定主机ID（可选）')
})

export default define('search_memory', {
  description:
    '在全局经验库或当前主机/话题中搜索关联记忆。当信息不足或需要参考历史操作时，主动发起搜索。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { query, hostId } = args
    const normalizedHostId = hostId ? normalizeHostId(hostId) : undefined
    const memories = await ctx.agentService.searchMemories(query, normalizedHostId, ctx.topicId)
    const formattedMemories = (memories as Record<string, unknown>[]).map((m) => ({
      type: m.type,
      content: m.content,
      importance: m.importance,
      timestamp: new Date(m.timestamp as string | number).toISOString()
    }))
    return { output: JSON.stringify(formattedMemories) }
  }
})
