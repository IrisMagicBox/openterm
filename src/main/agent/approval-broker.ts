import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { AuthResponse } from '../AgentRunner'
import { logger } from '../logger'
import {
  normalizeApprovalScope,
  permissionGrantMatches,
  permissionRequestsMatch,
  type PermissionGrant,
  type PermissionApprovalScope,
  type PermissionRequestIdentity
} from './permission-scope'

export const APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000

interface PendingApprovalRequest {
  resolve: (response: AuthResponse) => void
  reject: (error: Error) => void
  runId?: string
  topicId?: string
  taskId?: string
  turnId?: string
  permission?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  createdAt: number
  timer: NodeJS.Timeout
}

export class ApprovalBroker {
  private webContents?: WebContents
  private pendingRequests: Map<string, PendingApprovalRequest> = new Map()
  private grants: PermissionGrant[] = []

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  async requestAuthorization(
    command: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<AuthResponse> {
    const requestId = uuidv4()
    const createdAt = Date.now()
    const runId = typeof metadata?.runId === 'string' ? metadata.runId : undefined
    const topicId = typeof metadata?.topicId === 'string' ? metadata.topicId : undefined
    const taskId = typeof metadata?.taskId === 'string' ? metadata.taskId : undefined
    const turnId = typeof metadata?.turnId === 'string' ? metadata.turnId : undefined
    const permission = typeof metadata?.permission === 'string' ? metadata.permission : undefined
    const existingGrant = this.findGrant({
      permission,
      topicId,
      runId,
      turnId,
      riskLevel
    })
    if (existingGrant) {
      return {
        approved: true,
        alwaysAllow: existingGrant.scope === 'topic',
        scope: existingGrant.scope
      }
    }

    this.webContents?.send('agent:auth-request', {
      requestId,
      command,
      riskLevel,
      reason,
      metadata: {
        ...(metadata ?? {}),
        requestCreatedAt: createdAt
      }
    })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectRequest(
          requestId,
          `Approval request timed out after ${Math.round(APPROVAL_TIMEOUT_MS / 3600000)} hours.`
        )
      }, APPROVAL_TIMEOUT_MS)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        runId,
        topicId,
        taskId,
        turnId,
        permission,
        riskLevel,
        createdAt,
        timer
      })
    })
  }

  async handleAuthResponse(
    requestId: string,
    approved: boolean,
    scopeOrAlwaysAllow: PermissionApprovalScope | boolean = false
  ): Promise<void> {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      logger.warn('ApprovalBroker', 'Received auth response for unknown request', {
        requestId,
        approved,
        scopeOrAlwaysAllow,
        pendingCount: this.pendingRequests.size
      })
      return
    }

    const scope = approved ? normalizeApprovalScope(scopeOrAlwaysAllow) : 'request'
    const alwaysAllow = scope === 'topic'
    const response: AuthResponse = { approved, alwaysAllow, scope }
    if (approved && scope !== 'request') {
      this.rememberGrant(pending, scope)
    }
    const targets =
      approved && scope !== 'request'
        ? this.collectMatchingRequests(pending, scope)
        : [[requestId, pending] as const]

    for (const [targetId, target] of targets) {
      clearTimeout(target.timer)
      target.resolve(response)
      this.pendingRequests.delete(targetId)
    }
  }

  rejectRuns(runIds: string[], reason: string): void {
    const runIdSet = new Set(runIds)
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.runId && runIdSet.has(pending.runId)) {
        this.rejectRequest(requestId, reason)
      }
    }
  }

  private rejectRequest(requestId: string, reason: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.reject(new Error(reason))
    this.pendingRequests.delete(requestId)
  }

  private collectMatchingRequests(
    source: PendingApprovalRequest,
    scope: PermissionApprovalScope
  ): Array<readonly [string, PendingApprovalRequest]> {
    if (scope === 'request') return []
    const sourceIdentity = this.identityFor(source)
    const matches: Array<readonly [string, PendingApprovalRequest]> = []

    for (const entry of this.pendingRequests.entries()) {
      const [, pending] = entry
      if (!permissionRequestsMatch(sourceIdentity, this.identityFor(pending))) continue
      if (scope === 'topic' && source.topicId && pending.topicId === source.topicId) {
        matches.push(entry)
      } else if (
        scope === 'turn' &&
        source.runId &&
        source.turnId &&
        pending.runId === source.runId &&
        pending.turnId === source.turnId
      ) {
        matches.push(entry)
      }
    }

    return matches
  }

  private identityFor(pending: PendingApprovalRequest): PermissionRequestIdentity {
    return {
      permission: pending.permission,
      topicId: pending.topicId,
      runId: pending.runId,
      turnId: pending.turnId,
      riskLevel: pending.riskLevel
    }
  }

  private findGrant(request: PermissionRequestIdentity): PermissionGrant | undefined {
    return this.grants.find((grant) => permissionGrantMatches(grant, request))
  }

  private rememberGrant(source: PendingApprovalRequest, scope: PermissionApprovalScope): void {
    if (!source.permission) return
    if (scope === 'topic' && !source.topicId) return
    if (scope === 'turn' && (!source.runId || !source.turnId)) return

    const grant: PermissionGrant = {
      permission: source.permission,
      topicId: source.topicId,
      runId: source.runId,
      turnId: source.turnId,
      riskLevel: source.riskLevel,
      scope
    }
    this.grants = [
      grant,
      ...this.grants.filter(
        (item) =>
          !(
            item.permission === grant.permission &&
            item.scope === grant.scope &&
            item.topicId === grant.topicId &&
            item.runId === grant.runId &&
            item.turnId === grant.turnId
          )
      )
    ]
  }
}
