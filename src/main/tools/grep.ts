import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  pattern: z.string().describe('搜索模式（支持正则表达式）'),
  path: z.string().describe('搜索路径（文件或目录）'),
  caseSensitive: z.boolean().optional().describe('是否区分大小写，默认true'),
  maxResults: z.number().optional().describe('最大返回结果数，默认100'),
  include: z.string().optional().describe('文件匹配模式（如 "*.js"），可选'),
  exclude: z.string().optional().describe('排除文件模式（如 "node_modules"），可选')
})

export default define('grep', {
  description:
    '在指定主机上搜索文件内容。支持正则表达式匹配，可以搜索单个文件或整个目录。返回匹配的行及其行号。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, pattern, path, caseSensitive = true, maxResults = 100, include, exclude } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return { output: `Error: Host ${hostId} not found` }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined)

    let grepCmd = 'grep'
    if (!caseSensitive) {
      grepCmd += ' -i'
    }
    grepCmd += ` -n -r "${pattern.replace(/"/g, '\\"')}" "${path}"`

    if (include) {
      grepCmd += ` --include="${include}"`
    }
    if (exclude) {
      grepCmd += ` --exclude-dir="${exclude}"`
    }

    grepCmd += ` | head -n ${maxResults}`

    const result = await commandExecutor.execute(sessionId, grepCmd, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0 && result.content.length === 0) {
      return { output: `No matches found for pattern "${pattern}" in ${path}` }
    }

    return {
      output: result.content,
      metadata: {
        matchCount: result.content.split('\n').filter((l) => l.trim()).length
      }
    }
  }
})
