import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { terminalIODB } from '../db'

const parameters = z.object({
  query: z.string().describe('搜索关键词，支持命令内容模糊匹配'),
  filters: z
    .object({
      includeDeleted: z.boolean().optional().describe('是否包含已删除终端的历史记录，默认 true'),
      limit: z.number().optional().describe('返回结果数量限制，默认 20')
    })
    .optional()
})

export default define('search_terminal_history', {
  description:
    '搜索 Topic 中所有终端（包括已删除）的命令历史。当你需要查找之前执行过的命令、了解历史操作或追溯已删除终端的活动时调用此工具。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const results = terminalIODB.searchCommandHistory(ctx.topicId, args.query, {
      includeDeleted: args.filters?.includeDeleted !== false,
      limit: args.filters?.limit || 20
    })

    const formatted = results.map((r) => ({
      command: r.io.content,
      timestamp: r.io.timestamp,
      sessionId: r.io.sessionId,
      hostId: r.io.hostId,
      isSessionDeleted: r.isSessionDeleted
    }))

    return {
      output: JSON.stringify(
        {
          total: formatted.length,
          results: formatted
        },
        null,
        2
      )
    }
  }
})
