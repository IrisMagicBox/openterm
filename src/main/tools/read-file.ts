import type { ToolHandler, ToolContext, ToolResult } from './types'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const readFileHandler: ToolHandler = {
  name: 'read_file',
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        '从指定主机读取文件内容。当用户提到配置文件、日志文件或任何文件内容时，必须使用此工具读取实际内容，而非猜测。',
      parameters: {
        type: 'object',
        properties: {
          hostId: { type: 'string', description: '主机ID' },
          path: { type: 'string', description: '文件路径' }
        },
        required: ['hostId', 'path']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const hostId = args.hostId as string
    const path = args.path as string
    const terminalName = args.terminalName as string | undefined
    const host = resolveHostId(hostId)
    if (!host) throw new Error(`Host ${hostId} not found`)

    const sessionId = await ctx.ensureSession(host.id, host.alias, terminalName)
    const result = await commandExecutor.execute(
      sessionId,
      `cat "${path}"`,
      ctx.topicId,
      ctx.taskId
    )

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.content}`)
    }

    return result.content
  }
}

export default readFileHandler
