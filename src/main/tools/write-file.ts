import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { normalizeHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'
import { shellQuote } from './shell-quote'

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容')
})

export default define('write_file', {
  description:
    '向指定主机写入或覆盖文件内容。修改配置文件、创建脚本或写入多行文本时，必须使用此工具。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, path, content } = args
    const normalizedHostId = normalizeHostId(hostId)
    const commandPattern = `write_file ${normalizedHostId}:${path}`
    const policyMetadata = {
      riskCategory: 'write',
      commandPattern,
      requiresVerification: true,
      hostId: normalizedHostId,
      command: commandPattern,
      path
    }

    const approval = await ctx.requestAuthorization(
      commandPattern,
      'high',
      `写入或覆盖远端文件 ${path}`,
      policyMetadata
    )
    if (!approval.approved) {
      return { output: 'Error: User rejected file write authorization', metadata: policyMetadata }
    }

    const sessionId = await ctx.ensureSession(normalizedHostId, normalizedHostId, undefined, {
      role: 'agent_command'
    })
    ctx.updatePartMetadata?.({ ...policyMetadata, sessionId })

    const b64 = Buffer.from(content).toString('base64')
    const command = `printf %s ${shellQuote(b64)} | base64 -d > ${shellQuote(path)}`

    const result = await commandExecutor.execute(sessionId, command, ctx.topicId, ctx.taskId)
    const metadata = {
      ...policyMetadata,
      sessionId,
      exitCode: result.exitCode,
      durationMs: result.durationMs
    }
    ctx.updatePartMetadata?.(metadata)

    if (result.exitCode !== 0) {
      return { output: `Error: Failed to write file: ${result.content}`, metadata }
    }

    return { output: 'File written successfully', metadata }
  }
})
