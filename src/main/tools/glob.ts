import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  pattern: z.string().describe('文件匹配模式（如 "*.js", "src/**/*.ts"）'),
  path: z.string().optional().describe('搜索起始目录，默认为当前目录'),
  maxResults: z.number().optional().describe('最大返回结果数，默认100'),
  includeDirs: z.boolean().optional().describe('是否包含目录，默认false')
})

export default define('glob', {
  description:
    '在指定主机上查找匹配模式的文件。支持标准glob模式如 "*.js"、"src/**/*.ts"。返回匹配的文件路径列表。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, pattern, path = '.', maxResults = 100, includeDirs = false } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return { output: `Error: Host ${hostId} not found` }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined, {
      role: 'agent_command'
    })

    const typeFlag = includeDirs ? '' : ' -type f'
    const findCmd = `find "${path}"${typeFlag} -name "${pattern.replace(/"/g, '\\"')}" 2>/dev/null | head -n ${maxResults}`

    const result = await commandExecutor.execute(sessionId, findCmd, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0 && result.content.length === 0) {
      return { output: `No files found matching pattern "${pattern}" in ${path}` }
    }

    const files = result.content
      .split('\n')
      .filter((f) => f.trim())
      .sort()

    return {
      output: files.join('\n') || `No files found matching pattern "${pattern}"`,
      metadata: {
        fileCount: files.length,
        pattern,
        path
      }
    }
  }
})
