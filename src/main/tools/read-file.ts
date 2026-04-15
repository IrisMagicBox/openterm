import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  path: z.string().describe('文件路径')
})

export default define('read_file', {
  description:
    '从指定主机读取文件内容。当用户提到配置文件、日志文件或任何文件内容时，必须使用此工具读取实际内容，而非猜测。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, path } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return { output: `Error: Host ${hostId} not found` }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined)
    const result = await commandExecutor.execute(
      sessionId,
      `cat "${path}"`,
      ctx.topicId,
      ctx.taskId
    )

    if (result.exitCode !== 0) {
      return { output: `Error: Failed to read file: ${result.content}` }
    }

    return { output: result.content }
  }
})
