import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { define, Tool } from './tool-factory'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'
import { PolicyEngine } from '../PolicyEngine'
import { approvalDB, permissionDB, commandPatternDB, taskStepDB } from '../db'
import { COMMAND_TIMEOUT_MS, TRUST_APPROVAL_THRESHOLD } from '../constants'
import { truncateOutput } from './truncation'
import { shellQuote } from './shell-quote'
import { ShellAnalyzer } from '../utils/shell-analyzer'
import { shouldRequestApproval } from '../permissions'

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
    .describe('可选：Agent 专用可视终端名称。仅影响普通命令终端，不用于 TUI 并发。'),
  command: z.string().describe('要执行的命令'),
  workdir: z
    .string()
    .optional()
    .describe('命令工作目录。优先使用此字段，不要用 cd <dir> && command。'),
  timeoutMs: z
    .number()
    .min(100)
    .max(300000)
    .default(COMMAND_TIMEOUT_MS)
    .describe('最长等待毫秒数，超时后终止命令。'),
  reason: z.string().describe('执行该命令的原因'),
  verificationIds: z
    .array(z.string())
    .optional()
    .describe('可选：本命令用于确认的待验证操作 ID。只在只读验证命令中填写。')
})

export default define('execute_command', {
  description:
    '在指定主机的 Agent 专用可视终端中执行会自行结束的非交互命令。用户会实时看到命令输入和输出；普通检查、构建、验证、系统状态收集请用本工具，并用 workdir 指定目录。若命令会进入 TUI、交互式安装器、菜单、编辑器、REPL 或需要键盘选择，改用 manage_terminal + observe_terminal + send_terminal_keys + wait_terminal_activity。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { hostId, command, reason, workdir, timeoutMs, terminalName } = args
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
    const commandSegments = ShellAnalyzer.splitSegments(command).map((segment, index) => ({
      index,
      raw: segment.raw,
      command: segment.command,
      args: segment.args
    }))
    const permissions = permissionDB.getPermissions()
    const policyMetadata = {
      riskLevel: policyResult.riskLevel,
      riskCategory: policyResult.riskCategory,
      trustLevel: policyResult.trustLevel,
      commandPattern,
      commandSegments,
      requiresVerification: policyResult.requiresVerification
    }

    if (policyResult.action === 'confirm' && shouldRequestApproval(permissions, policyResult)) {
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
          ...policyMetadata,
          reason,
          status: 'approved',
          createdAt: Date.now()
        })
      }
    }

    // Update the step with actual hostId for trace and memory reflection
    taskStepDB.updateStep(ctx.stepId!, { hostId: host.id })
    ctx.updatePartMetadata?.({
      hostId: host.id,
      hostAlias: host.alias,
      command,
      workdir,
      timeoutMs,
      ...policyMetadata
    })

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
          live: true,
          liveOutputBytes: fullOutput.length,
          liveOutputTruncated: preview.truncated,
          liveOutputPreview: preview.output,
          liveUpdatedAt: now
        }
      })
    }

    const sessionId = await ctx.ensureSession(host.id, host.alias, terminalName, {
      role: 'agent_command',
      visible: true
    })
    const visibleCommand = workdir ? `cd ${shellQuote(workdir)} && ${command}` : command
    ctx.updatePartMetadata?.({
      displayMode: 'terminal',
      sessionId,
      terminalRole: 'agent_command',
      visibleCommand
    })

    const result = await commandExecutor.executeAgentCommand(
      sessionId,
      visibleCommand,
      ctx.topicId,
      ctx.taskId,
      ctx.stepId,
      {
        timeoutMs,
        onOutputChunk: (_chunk, fullOutput) => publishLiveOutput(fullOutput)
      }
    )
    const combinedOutput = result.content
    const timedOut = Boolean(result.timedOut)
    const effectiveWorkdir = result.cwd || workdir
    const commandResult = {
      stdout: combinedOutput,
      stderr: '',
      content: combinedOutput,
      combinedOutput,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut,
      workdir: effectiveWorkdir,
      sessionId,
      displayMode: 'terminal',
      terminalRole: 'agent_command',
      isTruncated: result.isTruncated
    }
    publishLiveOutput(lastLiveOutput || commandResult.content, true)

    const commandMetadata = {
      ...policyMetadata,
      hostId: host.id,
      hostAlias: host.alias,
      command,
      visibleCommand,
      displayMode: 'terminal',
      sessionId,
      terminalRole: 'agent_command',
      workdir: effectiveWorkdir,
      timeoutMs,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      combinedOutput,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut,
      isTruncated: result.isTruncated,
      live: false
    }
    ctx.updatePartMetadata?.(commandMetadata)

    // Truncate large outputs to protect the context window budget.
    const rawOutput = JSON.stringify(commandResult, null, 2)
    const truncated = truncateOutput(rawOutput, ctx.topicId, ctx.stepId)

    if (truncated.truncated) {
      const metadata = {
        ...commandMetadata,
        truncated: true,
        isTruncated: true,
        originalLines: truncated.originalLines,
        originalBytes: truncated.originalBytes,
        diskPath: truncated.outputPath,
        outputPath: truncated.outputPath
      }
      ctx.updatePartMetadata?.(metadata)

      return {
        output: truncated.content,
        metadata
      }
    }

    return { output: truncated.content, metadata: commandMetadata }
  }
})
