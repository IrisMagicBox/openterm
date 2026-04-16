import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { terminalSessionDB } from '../db'

const parameters = z.object({
  limit: z.number().optional().describe('返回结果数量限制，默认 10')
})

export default define('get_deleted_terminals', {
  description:
    '列出当前 Topic 中所有已删除的终端。当你需要查看历史终端记录、追溯已删除终端的信息或恢复终端时调用此工具。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const deleted = terminalSessionDB.getDeletedSessionsByTopic(ctx.topicId)

    const summary = deleted.slice(0, args.limit || 10).map((t) => ({
      id: t.id,
      name: t.name,
      hostId: t.hostId,
      hostAlias: t.hostAlias,
      deletedAt: t.deletedAt,
      deletedBy: t.deletedBy,
      createdAt: t.createdAt
    }))

    return {
      output: JSON.stringify(
        {
          total: deleted.length,
          terminals: summary
        },
        null,
        2
      )
    }
  }
})
