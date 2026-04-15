import { z } from 'zod'
import { define, Tool } from './tool-factory'

const parameters = z.object({
  query: z.string().describe('搜索关键词')
})

export default define('search_topics', {
  description:
    '搜索历史话题（对话），寻找处理类似问题的历史记录。当遇到类似之前处理过的问题时，主动搜索历史经验。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { query } = args
    const topics = await ctx.agentService.searchTopics(query)
    const formattedTopics = (topics as Record<string, unknown>[]).map((t) => ({
      id: t.id,
      title: t.title,
      lastAt: new Date(t.lastMessageAt as string | number).toISOString()
    }))
    return { output: JSON.stringify(formattedTopics) }
  }
})
