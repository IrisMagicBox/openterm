import { describe, expect, it } from 'vitest'
import type { PermissionSettings } from '../../shared/types'
import { shouldAskToolPermission, shouldRequestApproval } from '../permissions'

function settings(permissionMode: PermissionSettings['permissionMode']): PermissionSettings {
  return {
    permissionMode,
    updatedAt: 1
  }
}

describe('permission mode decisions', () => {
  it('asks for risky command policy hits in default mode', () => {
    expect(
      shouldRequestApproval(settings('default'), {
        riskLevel: 'medium',
        riskCategory: 'network'
      })
    ).toBe(true)
  })

  it('auto-reviews low and medium non-mutating operations', () => {
    expect(
      shouldRequestApproval(settings('auto_review'), {
        riskLevel: 'medium',
        riskCategory: 'network'
      })
    ).toBe(false)
    expect(
      shouldAskToolPermission(settings('auto_review'), {
        permission: 'websearch',
        riskLevel: 'medium',
        riskCategory: 'network'
      })
    ).toBe(false)
  })

  it('keeps mutating operations interactive in auto-review mode', () => {
    expect(
      shouldRequestApproval(settings('auto_review'), {
        riskLevel: 'high',
        riskCategory: 'write'
      })
    ).toBe(true)
    expect(
      shouldAskToolPermission(settings('auto_review'), {
        permission: 'write_file',
        riskLevel: 'high',
        riskCategory: 'write'
      })
    ).toBe(true)
  })

  it('skips approval prompts in full access mode', () => {
    expect(
      shouldRequestApproval(settings('full_access'), {
        riskLevel: 'critical',
        riskCategory: 'destructive'
      })
    ).toBe(false)
    expect(
      shouldAskToolPermission(settings('full_access'), {
        permission: 'write_file',
        riskLevel: 'high',
        riskCategory: 'write'
      })
    ).toBe(false)
  })
})
