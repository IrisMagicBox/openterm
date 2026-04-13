import type { ToolHandler, ToolContext, ToolResult } from './types'
import type { AgentSession } from '../agent'

const listTerminalsHandler: ToolHandler = {
  name: 'list_terminals',
  definition: {
    type: 'function',
    function: {
      name: 'list_terminals',
      description:
        '列出当前话题下所有活动终端的详细信息（包括ID、名称、主机、状态）。在执行任何终端操作前，应先调用此工具了解当前环境。当你不确定有哪些终端时，必须主动调用。',
      parameters: { type: 'object', properties: {} }
    }
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const sessions = await ctx.agentService.getSessions(ctx.topicId)
    return sessions.map((s: AgentSession) => ({
      id: s.id,
      name: s.name,
      hostId: s.hostId,
      hostAlias: s.hostAlias,
      status: s.status,
      paused: s.paused,
      isPinned: s.isPinned,
      createdAt: s.createdAt
    }))
  }
}

export default listTerminalsHandler
