import { v4 as uuidv4 } from 'uuid'
import type { AgentConfig } from './agent-config'
import type { AgentContext, AuthResponse } from '../AgentRunner'
import { agentRunStore } from './agent-run-store'
import { approvalDB } from '../db'
import type { AgentPart, ApprovalRiskLevel, PolicyRiskCategory } from '../../shared/types'

export interface AgentPermissionRequest {
  permission: string
  pattern: string
  riskLevel?: ApprovalRiskLevel
  reason?: string
  always?: boolean
  metadata?: Record<string, unknown>
}

export class AgentPermissionEngine {
  constructor(
    private readonly config: AgentConfig,
    private readonly context: AgentContext
  ) {}

  isToolAllowed(toolName: string): boolean {
    const explicit = this.config.permissions.find((p) => p.tool === toolName || p.tool === '*')
    if (explicit && !explicit.allowed) return false
    if (this.config.allowedTools.length === 0) return true
    return this.config.allowedTools.includes(toolName)
  }

  async ask(request: AgentPermissionRequest): Promise<AuthResponse> {
    const riskLevel = request.riskLevel ?? 'medium'
    const part = this.createPermissionPart(request, riskLevel)
    agentRunStore.updateRun(this.context.runId!, { status: 'waiting_approval' })

    try {
      const response = await this.context.requestAuthorization(
        request.pattern,
        riskLevel,
        request.reason ?? `Permission required: ${request.permission}`,
        request.metadata
      )

      approvalDB.createApproval({
        id: uuidv4(),
        taskId: this.context.taskId,
        stepId: this.context.stepId,
        command: request.pattern,
        riskLevel,
        riskCategory:
          typeof request.metadata?.riskCategory === 'string'
            ? (request.metadata.riskCategory as PolicyRiskCategory)
            : undefined,
        commandPattern:
          typeof request.metadata?.commandPattern === 'string'
            ? request.metadata.commandPattern
            : undefined,
        requiresVerification: request.metadata?.requiresVerification === true,
        reason: request.reason,
        status: response.approved ? 'approved' : 'rejected',
        createdAt: Date.now(),
        respondedAt: Date.now()
      })

      agentRunStore.updatePart(part.id, {
        status: response.approved ? 'completed' : 'error',
        output: response.approved ? 'Permission approved' : undefined,
        error: response.approved ? undefined : 'Permission denied',
        endedAt: Date.now(),
        metadata: { approved: response.approved, alwaysAllow: response.alwaysAllow }
      })

      if (!response.approved) {
        throw new Error(`Permission denied for ${request.permission}: ${request.pattern}`)
      }

      agentRunStore.updateRun(this.context.runId!, { status: 'running' })
      return response
    } catch (error) {
      agentRunStore.updateRun(this.context.runId!, { status: 'running' })
      throw error
    }
  }

  private createPermissionPart(
    request: AgentPermissionRequest,
    riskLevel: ApprovalRiskLevel
  ): AgentPart {
    return agentRunStore.createPart({
      runId: this.context.runId!,
      parentPartId: this.context.partId,
      type: 'permission',
      status: 'blocked',
      input: request.pattern,
      metadata: {
        permission: request.permission,
        riskLevel,
        reason: request.reason,
        ...(request.metadata ?? {})
      },
      startedAt: Date.now()
    })
  }
}
