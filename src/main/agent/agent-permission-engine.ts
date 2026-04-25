import { v4 as uuidv4 } from 'uuid'
import type { AgentConfig, PermissionRule } from './agent-config'
import type { AgentContext, AuthResponse } from '../AgentRunner'
import { agentRunStore } from './agent-run-store'
import { approvalDB } from '../db'
import type { AgentPart, ApprovalRiskLevel, PolicyRiskCategory } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'

export interface AgentPermissionRequest {
  permission: string
  pattern: string
  riskLevel?: ApprovalRiskLevel
  reason?: string
  always?: boolean
  metadata?: Record<string, unknown>
}

export class AgentPermissionEngine {
  private static readonly RISK_LEVELS: Record<ApprovalRiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  }

  constructor(
    private readonly config: AgentConfig,
    private readonly context: AgentContext
  ) {}

  isToolAllowed(toolName: string): boolean {
    const explicit = this.findRule(toolName)
    if (explicit?.action === 'deny' || explicit?.allowed === false) return false
    if (this.config.allowedTools.length === 0) return true
    return this.config.allowedTools.includes(toolName)
  }

  async ask(request: AgentPermissionRequest): Promise<AuthResponse> {
    const riskLevel = request.riskLevel ?? 'medium'
    const rule = this.findRule(request.permission)
    const action = this.resolveAskAction(rule)
    const part = this.createPermissionPart(request, riskLevel)

    if (action === 'allow' && this.isWithinMaxRisk(rule, riskLevel)) {
      const response = { approved: true, alwaysAllow: rule?.scope === 'always' }
      agentRunStore.updatePart(part.id, {
        status: 'completed',
        output: 'Permission auto-approved by ruleset',
        endedAt: Date.now(),
        metadata: {
          approved: true,
          alwaysAllow: response.alwaysAllow,
          ruleAction: action,
          scope: rule?.scope ?? 'once'
        }
      })
      return response
    }

    if (action === 'deny' || (action === 'allow' && !this.isWithinMaxRisk(rule, riskLevel))) {
      const feedback = this.rejectFeedback(request, rule, riskLevel)
      this.recordApproval(request, riskLevel, false)
      agentRunStore.updatePart(part.id, {
        status: 'error',
        error: feedback,
        endedAt: Date.now(),
        metadata: { approved: false, ruleAction: 'deny', feedback }
      })
      throw new Error(feedback)
    }

    this.updateRunIfActive('waiting_approval')

    let approvalRecorded = false
    try {
      const response = await this.context.requestAuthorization(
        request.pattern,
        riskLevel,
        request.reason ?? `Permission required: ${request.permission}`,
        request.metadata
      )

      this.recordApproval(request, riskLevel, response.approved)
      approvalRecorded = true

      agentRunStore.updatePart(part.id, {
        status: response.approved ? 'completed' : 'error',
        output: response.approved ? 'Permission approved' : undefined,
        error: response.approved ? undefined : 'Permission denied',
        endedAt: Date.now(),
        metadata: { approved: response.approved, alwaysAllow: response.alwaysAllow }
      })

      if (!response.approved) {
        throw new Error(this.rejectFeedback(request, rule, riskLevel))
      }

      this.updateRunIfActive('running')
      return response
    } catch (error) {
      const feedback = getErrorMessage(error)
      if (!approvalRecorded) {
        this.recordApproval(request, riskLevel, false)
        agentRunStore.updatePart(part.id, {
          status: 'error',
          error: feedback,
          endedAt: Date.now(),
          metadata: { approved: false, feedback }
        })
      }
      this.updateRunIfActive('running')
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

  private findRule(permission: string): PermissionRule | undefined {
    return (
      this.config.permissions.find((rule) => rule.tool === permission) ??
      this.config.permissions.find((rule) => rule.tool === '*')
    )
  }

  private resolveAskAction(rule: PermissionRule | undefined): 'allow' | 'deny' | 'ask' {
    if (rule?.action) return rule.action
    if (rule?.allowed === false) return 'deny'
    return 'ask'
  }

  private isWithinMaxRisk(rule: PermissionRule | undefined, riskLevel: ApprovalRiskLevel): boolean {
    if (!rule?.maxAutoApproveRisk) return true
    return (
      AgentPermissionEngine.RISK_LEVELS[riskLevel] <=
      AgentPermissionEngine.RISK_LEVELS[rule.maxAutoApproveRisk]
    )
  }

  private rejectFeedback(
    request: AgentPermissionRequest,
    rule: PermissionRule | undefined,
    riskLevel: ApprovalRiskLevel
  ): string {
    if (rule?.rejectBehavior === 'reject_with_feedback' && rule.rejectFeedback) {
      return rule.rejectFeedback
    }

    if (rule?.action === 'allow' && !this.isWithinMaxRisk(rule, riskLevel)) {
      return `Permission denied for ${request.permission}: risk ${riskLevel} exceeds maxAutoApproveRisk ${rule.maxAutoApproveRisk}.`
    }

    return `Permission denied for ${request.permission}: ${request.pattern}`
  }

  private recordApproval(
    request: AgentPermissionRequest,
    riskLevel: ApprovalRiskLevel,
    approved: boolean
  ): void {
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
      status: approved ? 'approved' : 'rejected',
      createdAt: Date.now(),
      respondedAt: Date.now()
    })
  }

  private updateRunIfActive(status: 'running' | 'waiting_approval'): void {
    const runId = this.context.runId
    if (!runId) return
    const run = agentRunStore.getRun(runId)
    if (
      !run ||
      run.status === 'cancelled' ||
      run.status === 'completed' ||
      run.status === 'failed'
    ) {
      return
    }
    agentRunStore.updateRun(runId, { status })
  }
}
