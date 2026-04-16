import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  path: z.string().describe('文件路径'),
  oldString: z.string().describe('要替换的文本（必须精确匹配）'),
  newString: z.string().describe('替换后的新文本'),
  occurrences: z.enum(['all', 'first']).optional().describe('替换所有匹配项还是仅第一个，默认all')
})

export default define('edit', {
  description:
    '在指定主机的文件中替换文本内容。oldString必须精确匹配文件中的现有内容。支持替换所有匹配项或仅第一个。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, path, oldString, newString, occurrences = 'all' } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return { output: `Error: Host ${hostId} not found` }
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, undefined)

    // First read the file to verify it exists and check match count
    const readResult = await commandExecutor.execute(
      sessionId,
      `cat "${path}"`,
      ctx.topicId,
      ctx.taskId
    )

    if (readResult.exitCode !== 0) {
      return { output: `Error: Failed to read file: ${readResult.content}` }
    }

    const content = readResult.content
    const matchCount = (
      content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
    ).length

    if (matchCount === 0) {
      return {
        output: `Error: oldString not found in file. No changes made.`,
        metadata: { error: 'NO_MATCH', path }
      }
    }

    // Use sed for replacement
    const escapeForSed = (str: string) => str.replace(/[\\/&]/g, '\\$&').replace(/\n/g, '\\n')

    let sedCmd: string
    if (occurrences === 'first') {
      sedCmd = `sed -i '0,/${escapeForSed(oldString)}/s//${escapeForSed(newString)}/' "${path}"`
    } else {
      sedCmd = `sed -i 's/${escapeForSed(oldString)}/${escapeForSed(newString)}/g' "${path}"`
    }

    const result = await commandExecutor.execute(sessionId, sedCmd, ctx.topicId, ctx.taskId)

    if (result.exitCode !== 0) {
      return {
        output: `Error: Failed to edit file: ${result.content}`,
        metadata: { error: 'EDIT_FAILED', path }
      }
    }

    const replacedCount = occurrences === 'first' ? 1 : matchCount

    return {
      output: `Successfully replaced ${replacedCount} occurrence(s) in ${path}`,
      metadata: {
        path,
        replacedCount,
        totalMatches: matchCount,
        occurrences
      }
    }
  }
})
