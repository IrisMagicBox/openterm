import type { ToolHandler, ToolContext, ToolResult } from './types'
import { normalizeHostId } from '../utils/host-resolver'

const searchMemoryHandler: ToolHandler = {
  name: 'search_memory',
  definition: {
    type: 'function',
    function: {
      name: 'search_memory',
      description:
        '在全局经验库或当前主机/话题中搜索关联记忆。当信息不足或需要参考历史操作时，主动发起搜索。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          hostId: { type: 'string', description: '限定主机ID（可选）' }
        },
        required: ['query']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const query = args.query as string
    const hostId = args.hostId as string | undefined
    const normalizedHostId = hostId ? normalizeHostId(hostId) : hostId
    const memories = await ctx.agentService.searchMemories(query, normalizedHostId, ctx.topicId)
    return (memories as Record<string, unknown>[]).map((m) => ({
      type: m.type,
      content: m.content,
      importance: m.importance,
      timestamp: new Date(m.timestamp as string | number).toISOString()
    }))
  }
}

export default searchMemoryHandler
