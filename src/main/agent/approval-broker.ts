import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { AuthResponse } from '../AgentRunner'
import { logger } from '../logger'

export const APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000

interface PendingApprovalRequest {
  resolve: (response: AuthResponse) => void
  reject: (error: Error) => void
  runId?: string
  taskId?: string
  createdAt: number
  timer: NodeJS.Timeout
}

export class ApprovalBroker {
  private webContents?: WebContents
  private pendingRequests: Map<string, PendingApprovalRequest> = new Map()

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
    const taskId = typeof metadata?.taskId === 'string' ? metadata.taskId : undefined
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
        taskId,
        createdAt,
        timer
      })
    })
  }

  async handleAuthResponse(
    requestId: string,
    approved: boolean,
    alwaysAllow = false
  ): Promise<void> {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      logger.warn('ApprovalBroker', 'Received auth response for unknown request', {
        requestId,
        approved,
        alwaysAllow,
        pendingCount: this.pendingRequests.size
      })
      return
    }

    clearTimeout(pending.timer)
    pending.resolve({ approved, alwaysAllow })
    this.pendingRequests.delete(requestId)
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
}
