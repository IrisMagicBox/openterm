import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'
import { PolicyEngine } from '../PolicyEngine'
import { approvalDB, permissionDB, commandPatternDB, taskStepDB } from '../db'
import { TRUST_APPROVAL_THRESHOLD } from '../constants'
import { truncateOutput } from './truncation'

const LIVE_TOOL_OUTPUT_LIMIT = 12000
const LIVE_TOOL_OUTPUT_UPDATE_INTERVAL_MS = 150
const LIVE_TOOL_OUTPUT_UPDATE_BYTES = 4096

function liveOutputPreview(output: string): { output: string; truncated: boolean } {
  if (output.length <= LIVE_TOOL_OUTPUT_LIMIT) return { output, truncated: false }
  return {
    output: `[live output truncated, showing last ${LIVE_TOOL_OUTPUT_LIMIT} chars]\n${output.slice(
      -LIVE_TOOL_OUTPUT_LIMIT
    )}`,
    truncated: true
  }
}

function recordPatternApproval(hostId: string, commandPattern: string, alwaysAllow: boolean): void {
  const existing = commandPatternDB.getPatternByHostAndPattern(hostId, commandPattern)
  if (existing) {
    if (alwaysAllow) {
      for (let i = 0; i < TRUST_APPROVAL_THRESHOLD; i++) {
        commandPatternDB.incrementApprovalCount(existing.id)
      }
    } else {
      commandPatternDB.incrementApprovalCount(existing.id)
    }
  } else {
    commandPatternDB.createCommandPattern({
      hostId,
      commandPattern,
      approvalCount: alwaysAllow ? TRUST_APPROVAL_THRESHOLD : 1,
      rejectionCount: 0,
      trustLevel: alwaysAllow ? 'trusted' : 'untrusted',
      lastSeen: Date.now()
    })
  }
}

function recordPatternRejection(hostId: string, commandPattern: string): void {
  const existing = commandPatternDB.getPatternByHostAndPattern(hostId, commandPattern)
  if (existing) {
    commandPatternDB.incrementRejectionCount(existing.id)
  } else {
    commandPatternDB.createCommandPattern({
      hostId,
      commandPattern,
      approvalCount: 0,
      rejectionCount: 1,
      trustLevel: 'untrusted',
      lastSeen: Date.now()
    })
  }
}

const parameters = z.object({
  hostId: z.string().describe('主机ID'),
  terminalName: z
    .string()
    .optional()
    .describe('终端名称（可选，默认为 default。用于命名或复用终端；同一主机仍按队列串行执行）'),
  command: z.string().describe('要执行的命令'),
  reason: z.string().describe('执行该命令的原因')
})

export default define('execute_command', {
  description:
    '在指定主机上执行会自行结束的终端命令。当你需要检查系统状态、验证服务运行、收集信息或执行普通命令时，必须使用此工具而非猜测结果。若命令会进入 TUI、交互式安装器、菜单、编辑器、REPL 或需要键盘选择，不要用本工具等待完成；改用 manage_terminal + observe_terminal + send_terminal_keys + wait_terminal_text 自动交互。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, command, reason, terminalName } = args
    const host = resolveHostId(hostId)
    if (!host) {
      return {
        output: `Error: Host ${hostId} not found. Please list_hosts to see available hosts in this topic.`
      }
    }

    const policyResult = PolicyEngine.evaluateWithTrust(command, host.id)
    if (policyResult.action === 'deny') {
      return { output: `Error: Command blocked by policy: ${policyResult.reason}` }
    }

    const commandPattern = policyResult.commandPattern || PolicyEngine.normalizeCommand(command)
    const permissions = permissionDB.getPermissions()
    const policyMetadata = {
      riskCategory: policyResult.riskCategory,
      commandPattern,
      requiresVerification: policyResult.requiresVerification
    }

    if (policyResult.action === 'confirm' && permissions.requireConfirmation) {
      const authResult = await ctx.requestAuthorization(
        command,
        policyResult.riskLevel,
        reason,
        policyMetadata
      )
      if (!authResult.approved) {
        recordPatternRejection(host.id, commandPattern)
        if (!ctx.runId) {
          approvalDB.createApproval({
            id: uuidv4(),
            taskId: ctx.taskId,
            stepId: ctx.stepId!,
            command,
            riskLevel: policyResult.riskLevel,
            ...policyMetadata,
            reason,
            status: 'rejected',
            createdAt: Date.now()
          })
        }
        return { output: 'Error: User rejected command authorization' }
      }

      recordPatternApproval(host.id, commandPattern, authResult.alwaysAllow)

      if (!ctx.runId) {
        approvalDB.createApproval({
          id: uuidv4(),
          taskId: ctx.taskId,
          stepId: ctx.stepId!,
          command,
          riskLevel: policyResult.riskLevel,
          ...policyMetadata,
          reason,
          status: 'approved',
          createdAt: Date.now()
        })
      }
    }

    // Update the step with actual hostId for trace and memory reflection
    taskStepDB.updateStep(ctx.stepId!, { hostId: host.id })
    ctx.updatePartMetadata?.({ hostId: host.id, hostAlias: host.alias, command, ...policyMetadata })

    const sessionId = await ctx.ensureSession(host.id, host.alias, terminalName)
    ctx.updatePartMetadata?.({ sessionId })
    let lastLiveUpdateAt = 0
    let lastLiveUpdateBytes = 0
    let lastLiveOutput = ''
    const publishLiveOutput = (fullOutput: string, force = false): void => {
      lastLiveOutput = fullOutput
      const now = Date.now()
      const byteDelta = fullOutput.length - lastLiveUpdateBytes
      if (
        !force &&
        now - lastLiveUpdateAt < LIVE_TOOL_OUTPUT_UPDATE_INTERVAL_MS &&
        byteDelta < LIVE_TOOL_OUTPUT_UPDATE_BYTES
      ) {
        return
      }

      const preview = liveOutputPreview(fullOutput)
      lastLiveUpdateAt = now
      lastLiveUpdateBytes = fullOutput.length
      ctx.updatePart?.({
        status: 'running',
        output: preview.output,
        metadata: {
          sessionId,
          live: true,
          liveOutputBytes: fullOutput.length,
          liveOutputTruncated: preview.truncated,
          liveOutputPreview: preview.output,
          liveUpdatedAt: now
        }
      })
    }

    const result = await commandExecutor.execute(
      sessionId,
      command,
      ctx.topicId,
      ctx.taskId,
      ctx.stepId!,
      {
        onOutputChunk: (_chunk, fullOutput) => publishLiveOutput(fullOutput)
      }
    )
    publishLiveOutput(lastLiveOutput || result.content, true)
    const commandMetadata = {
      ...policyMetadata,
      hostId: host.id,
      hostAlias: host.alias,
      sessionId,
      command,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cwd: result.cwd,
      isTruncated: result.isTruncated,
      live: false
    }
    ctx.updatePartMetadata?.(commandMetadata)

    // Truncate large outputs to protect the context window budget
    const rawOutput = JSON.stringify(result)
    const truncated = truncateOutput(rawOutput, ctx.topicId, ctx.stepId)

    if (truncated.truncated) {
      return {
        output: truncated.content,
        metadata: {
          truncated: true,
          originalLines: truncated.originalLines,
          originalBytes: truncated.originalBytes,
          diskPath: truncated.outputPath,
          outputPath: truncated.outputPath,
          ...commandMetadata
        }
      }
    }

    return { output: truncated.content, metadata: commandMetadata }
  }
})
