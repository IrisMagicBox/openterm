import type { ApprovalRiskLevel, PermissionApprovalScope } from '../../shared/types'

export type { PermissionApprovalScope }

const RISK_LEVELS: Record<ApprovalRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

export interface PermissionGrant {
  permission: string
  topicId?: string
  runId?: string
  turnId?: string
  riskLevel: ApprovalRiskLevel
  scope: PermissionApprovalScope
}

export interface PermissionRequestIdentity {
  permission?: string
  topicId?: string
  runId?: string
  turnId?: string
  riskLevel?: ApprovalRiskLevel
}

export function normalizeApprovalScope(
  scope: PermissionApprovalScope | boolean | undefined
): PermissionApprovalScope {
  if (scope === true) return 'topic'
  if (scope === false || scope === undefined) return 'turn'
  return scope
}

export function permissionGrantMatches(
  grant: PermissionGrant,
  request: PermissionRequestIdentity
): boolean {
  if (!request.permission || grant.permission !== request.permission) return false
  if (!request.riskLevel || RISK_LEVELS[request.riskLevel] > RISK_LEVELS[grant.riskLevel]) {
    return false
  }

  if (grant.scope === 'topic') {
    return Boolean(grant.topicId && request.topicId === grant.topicId)
  }

  if (grant.scope === 'turn') {
    return Boolean(
      grant.runId &&
        grant.turnId &&
        request.runId === grant.runId &&
        request.turnId === grant.turnId
    )
  }

  return false
}

export function permissionRequestsMatch(
  left: PermissionRequestIdentity,
  right: PermissionRequestIdentity
): boolean {
  if (!left.permission || left.permission !== right.permission) return false
  if (!left.riskLevel || !right.riskLevel) return false
  return RISK_LEVELS[right.riskLevel] <= RISK_LEVELS[left.riskLevel]
}
