import { z } from 'zod'
import { define, Tool } from './tool-factory'
import type { AgentSession } from '../agent'

const parameters = z.object({})

export default define('list_terminals', {
  description:
    '列出当前话题下所有活动终端的详细信息（包括ID、名称、主机、状态）。在执行任何终端操作前，应先调用此工具了解当前环境。当你不确定有哪些终端时，必须主动调用。',
  parameters,
  async execute(_args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const sessions = await ctx.agentService.getSessions(ctx.topicId)
    const formattedSessions = sessions.map((s: AgentSession) => ({
      id: s.id,
      name: s.name,
      hostId: s.hostId,
      hostAlias: s.hostAlias,
      status: s.status,
      paused: s.paused,
      isPinned: s.isPinned,
      createdAt: s.createdAt
    }))
    return { output: JSON.stringify(formattedSessions) }
  }
})
