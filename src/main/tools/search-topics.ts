import type { ToolHandler, ToolContext, ToolResult } from './types'

const searchTopicsHandler: ToolHandler = {
  name: 'search_topics',
  definition: {
    type: 'function',
    function: {
      name: 'search_topics',
      description:
        '搜索历史话题（对话），寻找处理类似问题的历史记录。当遇到类似之前处理过的问题时，主动搜索历史经验。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const query = args.query as string
    const topics = await ctx.agentService.searchTopics(query)
    return (topics as Record<string, unknown>[]).map((t) => ({
      id: t.id,
      title: t.title,
      lastAt: new Date(t.lastMessageAt as string | number).toISOString()
    }))
  }
}

export default searchTopicsHandler
