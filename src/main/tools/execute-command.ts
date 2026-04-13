import { v4 as uuidv4 } from 'uuid'
import { resolveHostId } from '../utils/host-resolver'
import { commandExecutor } from '../terminal'
import { PolicyEngine } from '../PolicyEngine'
import { approvalDB, permissionDB, commandPatternDB, taskStepDB } from '../db'
import { TRUST_APPROVAL_THRESHOLD } from '../constants'
import type { ToolHandler, ToolContext, ToolDefinition, ToolResult } from './types'

function recordPatternApproval(hostId: string, commandPattern: string, alwaysAllow: boolean) {
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

function recordPatternRejection(hostId: string, commandPattern: string) {
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

const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute_command',
    description:
      '在指定主机上执行终端命令。当你需要检查系统状态、验证服务运行、收集信息或执行任何操作时，必须使用此工具而非猜测结果。主动执行命令来获取实时信息。',
    parameters: {
      type: 'object',
      properties: {
        hostId: { type: 'string', description: '主机ID' },
        terminalName: {
          type: 'string',
          description: '终端名称（可选，默认为 default。指定新名称可开启并锁定新终端窗口实现并发）'
        },
        command: { type: 'string', description: '要执行的命令' },
        reason: { type: 'string', description: '执行该命令的原因' }
      },
      required: ['hostId', 'command', 'reason']
    }
  }
}

async function execute(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string | ToolResult> {
  const hostId = args.hostId as string
  const command = args.command as string
  const reason = args.reason as string
  const terminalName = args.terminalName as string | undefined
  const host = resolveHostId(hostId)
  if (!host)
    throw new Error(
      `Host ${hostId} not found. Please list_hosts to see available hosts in this topic.`
    )

  const policyResult = PolicyEngine.evaluateWithTrust(command, host.id)
  if (policyResult.action === 'deny') {
    throw new Error(`Command blocked by policy: ${policyResult.reason}`)
  }

  const commandPattern = policyResult.commandPattern || PolicyEngine.normalizeCommand(command)
  const permissions = permissionDB.getPermissions()

  if (policyResult.action === 'confirm' && permissions.requireConfirmation) {
    const authResult = await ctx.requestAuthorization(command, policyResult.riskLevel, reason)
    if (!authResult.approved) {
      recordPatternRejection(host.id, commandPattern)
      approvalDB.createApproval({
        id: uuidv4(),
        taskId: ctx.taskId,
        stepId: ctx.stepId!,
        command,
        riskLevel: policyResult.riskLevel,
        reason,
        status: 'rejected',
        createdAt: Date.now()
      })
      throw new Error('User rejected command authorization')
    }

    recordPatternApproval(host.id, commandPattern, authResult.alwaysAllow)

    approvalDB.createApproval({
      id: uuidv4(),
      taskId: ctx.taskId,
      stepId: ctx.stepId!,
      command,
      riskLevel: policyResult.riskLevel,
      reason,
      status: 'approved',
      createdAt: Date.now()
    })
  }

  // Update the step with actual hostId for trace and memory reflection
  taskStepDB.updateStep(ctx.stepId!, { hostId: host.id })

  const sessionId = await ctx.ensureSession(host.id, host.alias, terminalName)
  const result = await commandExecutor.execute(
    sessionId,
    command,
    ctx.topicId,
    ctx.taskId,
    ctx.stepId!
  )
  return result as unknown as ToolResult
}

const executeCommandHandler: ToolHandler = {
  name: 'execute_command',
  definition,
  execute
}

export default executeCommandHandler
