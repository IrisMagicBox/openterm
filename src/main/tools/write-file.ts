import type { ToolHandler, ToolContext, ToolResult } from './types'
import { normalizeHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const writeFileHandler: ToolHandler = {
  name: 'write_file',
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        '向指定主机写入或覆盖文件内容。修改配置文件、创建脚本或写入多行文本时，必须使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          hostId: { type: 'string', description: '主机ID' },
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['hostId', 'path', 'content']
      }
    }
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const hostId = args.hostId as string
    const path = args.path as string
    const content = args.content as string
    const normalizedHostId = normalizeHostId(hostId)

    const sessionId = await ctx.ensureSession(normalizedHostId, normalizedHostId)

    const b64 = Buffer.from(content).toString('base64')
    const command = `printf "%s" '${b64}' | base64 -d > "${path}"`

    const result = await commandExecutor.execute(sessionId, command, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.content}`)
    }

    return { message: 'File written successfully', path }
  }
}

export default writeFileHandler
