import { describe, expect, it, vi } from 'vitest'
import { PolicyEngine } from '../PolicyEngine'

vi.mock('../db', () => ({
  commandPatternDB: {
    getPatternByHostAndPattern: vi.fn()
  }
}))

describe('PolicyEngine risk categories', () => {
  it('allows read-only commands without verification', () => {
    const result = PolicyEngine.evaluate('systemctl status nginx')
    expect(result.action).toBe('allow')
    expect(result.riskCategory).toBe('read')
    expect(result.requiresVerification).toBe(false)
  })

  it('marks write operations as verification-required', () => {
    const result = PolicyEngine.evaluate("sed -i 's/a/b/' /tmp/app.conf")
    expect(result.action).toBe('confirm')
    expect(result.riskCategory).toBe('write')
    expect(result.requiresVerification).toBe(true)
  })

  it('classifies package manager operations separately', () => {
    const result = PolicyEngine.evaluate('apt install nginx')
    expect(result.action).toBe('confirm')
    expect(result.riskCategory).toBe('package')
    expect(result.requiresVerification).toBe(true)
  })

  it('blocks never-auto-approve destructive commands', () => {
    const result = PolicyEngine.evaluate('rm -rf /')
    expect(result.action).toBe('deny')
    expect(result.riskCategory).toBe('destructive')
    expect(result.requiresVerification).toBe(true)
  })
})
