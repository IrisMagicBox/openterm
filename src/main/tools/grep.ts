import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'
import { shellQuote } from './shell-quote'
import { authorizeReadCommand } from './read-command-authorization'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  pattern: z.string().describe('搜索模式（支持正则表达式）'),
  path: z.string().describe('搜索路径（文件或目录）'),
  caseSensitive: z.boolean().optional().describe('是否区分大小写，默认true'),
  maxResults: z.number().int().min(1).max(1000).default(100).describe('最大返回结果数，默认100'),
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

    const options = ['-n', '-r']
    if (!caseSensitive) options.push('-i')
    if (include) options.push(`--include=${shellQuote(include)}`)
    if (exclude) options.push(`--exclude-dir=${shellQuote(exclude)}`)
    const grepCmd = `grep ${options.join(' ')} -- ${shellQuote(pattern)} ${shellQuote(path)} | head -n ${maxResults}`
    const authorization = await authorizeReadCommand(ctx, {
      toolName: 'grep',
      hostId: host.id,
      command: grepCmd,
      reason: `搜索 ${path} 中的内容`,
      metadata: { path, pattern, include, exclude }
    })
    if (!authorization.ok) {
      return { output: authorization.output, metadata: authorization.metadata }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined, {
      role: 'agent_command'
    })

    const result = await commandExecutor.execute(sessionId, grepCmd, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0 && result.content.length === 0) {
      return {
        output: `No matches found for pattern "${pattern}" in ${path}`,
        metadata: authorization.metadata
      }
    }

    return {
      output: result.content,
      metadata: {
        ...authorization.metadata,
        matchCount: result.content.split('\n').filter((l) => l.trim()).length
      }
    }
  }
})
