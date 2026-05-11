import type { ApprovalRiskLevel, PermissionSettings, PolicyRiskCategory } from '../shared/types'

const RISK_RANK: Record<ApprovalRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

export function shouldRequestApproval(
  settings: PermissionSettings,
  input: {
    riskLevel: ApprovalRiskLevel
    riskCategory?: PolicyRiskCategory | string
  }
): boolean {
  const mode = settings.permissionMode

  if (mode === 'full_access') {
    return false
  }

  if (mode === 'auto_review') {
    if (input.riskLevel === 'critical') return true
    if (
      input.riskCategory === 'destructive' ||
      input.riskCategory === 'write' ||
      input.riskCategory === 'privilege' ||
      input.riskCategory === 'package'
    ) {
      return true
    }
    return RISK_RANK[input.riskLevel] > RISK_RANK.medium
  }

  return true
}

export function shouldAskToolPermission(
  settings: PermissionSettings,
  input: {
    permission: string
    riskLevel: ApprovalRiskLevel
    riskCategory?: PolicyRiskCategory | string
  }
): boolean {
  if (settings.permissionMode === 'full_access') return false
  if (settings.permissionMode !== 'auto_review') return true

  if (input.permission === 'websearch') return false
  if (input.permission === 'manage_port_forward') return true
  if (input.permission === 'write_file') return true
  if (input.riskLevel === 'critical') return true
  return shouldRequestApproval(settings, input)
}
