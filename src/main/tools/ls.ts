import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  path: z.string().optional().describe('目录路径，默认为当前目录'),
  recursive: z.boolean().optional().describe('是否递归列出子目录，默认false'),
  showHidden: z.boolean().optional().describe('是否显示隐藏文件（以.开头），默认false'),
  maxDepth: z.number().optional().describe('递归深度限制（仅当recursive=true时有效）'),
  details: z.boolean().optional().describe('是否显示详细信息（权限、大小、修改时间），默认false')
})

export default define('ls', {
  description:
    '列出指定主机上的目录内容。支持递归列出、显示隐藏文件、限制深度等选项。返回文件和目录列表。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const {
      hostId,
      path = '.',
      recursive = false,
      showHidden = false,
      maxDepth,
      details = false
    } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return { output: `Error: Host ${hostId} not found` }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined)

    let lsCmd: string

    if (recursive) {
      const depthFlag = maxDepth !== undefined ? ` -maxdepth ${maxDepth}` : ''
      const hiddenFlag = showHidden ? '' : ' -not -path "*/\\.*"'
      lsCmd = `find "${path}"${depthFlag}${hiddenFlag} | sort`
    } else {
      const hiddenFlag = showHidden ? '-a' : ''
      const detailFlag = details ? '-l' : ''
      lsCmd = `ls ${detailFlag} ${hiddenFlag} "${path}" 2>/dev/null`
    }

    const result = await commandExecutor.execute(sessionId, lsCmd, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0) {
      return { output: `Error: Failed to list directory: ${result.content}` }
    }

    const lines = result.content.split('\n').filter((l) => l.trim())

    return {
      output: result.content,
      metadata: {
        itemCount: lines.length,
        path,
        recursive,
        showHidden
      }
    }
  }
})
