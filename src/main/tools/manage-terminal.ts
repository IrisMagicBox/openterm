import { z } from 'zod'
import { define, Tool } from './tool-factory'
import type { AgentSession } from '../agent'
import { normalizeHostId } from '../utils/host-resolver'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  action: z.enum(['open', 'close', 'rename']).describe('操作类型'),
  terminalName: z.string().optional().describe('终端名称。对于 open/rename 必须提供'),
  sessionId: z
    .string()
    .optional()
    .describe('操作 close/rename 时指定的会话ID（可选，若不提供则根据 terminalName 查找）')
})

export default define('manage_terminal', {
  description:
    '显式管理终端窗口（开启、关闭、重命名）。当你需要执行命令但无合适终端时主动创建；任务完成后主动关闭终端释放资源。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { action, hostId, terminalName, sessionId } = args
    const normalizedHostId = normalizeHostId(hostId)

    switch (action) {
      case 'open': {
        const session = await ctx.agentService.createTerminal(
          ctx.topicId,
          normalizedHostId,
          terminalName,
          { role: 'interactive' }
        )
        return {
          output: JSON.stringify({
            message: 'Terminal opened',
            sessionId: session.id,
            name: session.name
          })
        }
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
        if (!targetSessionId) {
          return {
            output: 'Error: No session found. Use list_terminals to see available sessions.'
          }
        }
        await ctx.agentService.closeTerminal(targetSessionId, { deletedBy: 'agent' })
        return {
          output: JSON.stringify({ message: 'Terminal closed', sessionId: targetSessionId })
        }
      }
      case 'rename': {
        if (!sessionId) {
          return { output: 'Error: sessionId is required for rename action' }
        }
        if (!terminalName) {
          return { output: 'Error: terminalName is required for rename action' }
        }
        await ctx.agentService.renameTerminal(sessionId, terminalName)
        return {
          output: JSON.stringify({ message: 'Terminal renamed', sessionId, newName: terminalName })
        }
      }
      default:
        return { output: 'Error: Invalid action for manage_terminal' }
    }
  }
})
