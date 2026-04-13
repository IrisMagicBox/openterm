import type { ToolHandler, ToolContext, ToolResult } from './types'
import type { AgentSession } from '../agent'
import { normalizeHostId } from '../utils/host-resolver'

const manageTerminalHandler: ToolHandler = {
  name: 'manage_terminal',
  definition: {
    type: 'function',
    function: {
      name: 'manage_terminal',
      description:
        '显式管理终端窗口（开启、关闭、重命名）。当你需要执行命令但无合适终端时主动创建；任务完成后主动关闭终端释放资源。',
      parameters: {
        type: 'object',
        properties: {
          hostId: { type: 'string', description: '主机ID' },
          action: {
            type: 'string',
            enum: ['open', 'close', 'rename'],
            description: '操作类型'
          },
          terminalName: {
            type: 'string',
            description: '终端名称。对于 open/rename 必须提供'
          },
          sessionId: {
            type: 'string',
            description:
              '操作 close/rename 时指定的会话ID（可选，若不提供则根据 terminalName 查找）'
          }
        },
        required: ['hostId', 'action']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const action = args.action as string
    const hostId = args.hostId as string
    const terminalName = args.terminalName as string | undefined
    const sessionId = args.sessionId as string | undefined
    const normalizedHostId = normalizeHostId(hostId)

    switch (action) {
      case 'open': {
        const session = await ctx.agentService.createTerminal(
          ctx.topicId,
          normalizedHostId,
          terminalName
        )
        return { message: 'Terminal opened', sessionId: session.id, name: session.name }
      }
      case 'close': {
        let targetSessionId = sessionId
        if (!targetSessionId && terminalName) {
          const sessions = await ctx.agentService.getSessions(ctx.topicId)
          const match = sessions.find(
            (s: AgentSession) => s.name === terminalName && s.hostId === normalizedHostId
          )
          if (match) targetSessionId = match.id
        }
        if (!targetSessionId)
          throw new Error('No session found. Use list_terminals to see available sessions.')
        await ctx.agentService.closeTerminal(targetSessionId)
        return { message: 'Terminal closed', sessionId: targetSessionId }
      }
      case 'rename': {
        if (!sessionId) throw new Error('sessionId is required for rename action')
        if (!terminalName) throw new Error('terminalName is required for rename action')
        await ctx.agentService.renameTerminal(sessionId, terminalName)
        return { message: 'Terminal renamed', sessionId, newName: terminalName }
      }
      default:
        throw new Error('Invalid action for manage_terminal')
    }
  }
}

export default manageTerminalHandler
