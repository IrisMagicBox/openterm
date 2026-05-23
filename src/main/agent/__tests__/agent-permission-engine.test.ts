import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentContext } from '../../AgentRunner'
import type { AgentConfig } from '../agent-config'
import type { AgentPart } from '../../../shared/types'

const mocks = vi.hoisted(() => {
  let partCount = 0
  return {
    resetPartCount: () => {
      partCount = 0
    },
    agentRunStore: {
      createPart: vi.fn((input: Partial<AgentPart>) => ({
        id: `permission-part-${++partCount}`,
        runId: input.runId ?? 'run-1',
        type: input.type ?? 'permission',
        status: input.status ?? 'blocked',
        orderIndex: partCount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...input
      })),
      updatePart: vi.fn(),
      getRun: vi.fn(() => ({ id: 'run-1', status: 'running' })),
      updateRun: vi.fn()
    },
    approvalDB: {
      createApproval: vi.fn()
    },
    permissionDB: {
      getPermissions: vi.fn(() => ({
        permissionMode: 'default',
        updatedAt: 1
      }))
    }
  }
})

vi.mock('../agent-run-store', () => ({
  agentRunStore: mocks.agentRunStore
}))

vi.mock('../../db', () => ({
  approvalDB: mocks.approvalDB,
  permissionDB: mocks.permissionDB
}))

import { AgentPermissionEngine } from '../agent-permission-engine'

function makeContext(): AgentContext {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    runId: 'run-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: vi.fn(),
    requestAuthorization: vi.fn(async () => ({ approved: true, alwaysAllow: false })),
    notifyStep: vi.fn(),
    metadata: vi.fn()
  }
}

function makeConfig(permissions: AgentConfig['permissions']): AgentConfig {
  return {
    name: 'test-agent',
    description: 'test',
    mode: 'primary',
    allowedTools: [],
    permissions
  }
}

describe('AgentPermissionEngine ruleset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetPartCount()
  })

  it('lets exact deny rules override wildcard allow rules for tool visibility', () => {
    const engine = new AgentPermissionEngine(
      makeConfig([
        { tool: '*', allowed: true },
        { tool: 'execute_command', action: 'deny' }
      ]),
      makeContext()
    )

    expect(engine.isToolAllowed('execute_command')).toBe(false)
    expect(engine.isToolAllowed('read_file')).toBe(true)
  })

  it('auto-approves allow rules without showing user approval UI', async () => {
    const context = makeContext()
    const engine = new AgentPermissionEngine(
      makeConfig([
        {
          tool: 'execute_command',
          action: 'allow',
          scope: 'always',
          maxAutoApproveRisk: 'medium'
        }
      ]),
      context
    )

    const response = await engine.ask({
      permission: 'execute_command',
      pattern: 'systemctl status nginx',
      riskLevel: 'medium',
      reason: 'verify service status'
    })

    expect(response).toEqual({ approved: true, alwaysAllow: true })
    expect(context.requestAuthorization).not.toHaveBeenCalled()
    expect(mocks.agentRunStore.updatePart).toHaveBeenCalledWith(
      'permission-part-1',
      expect.objectContaining({
        status: 'completed',
        metadata: expect.objectContaining({ ruleAction: 'allow', scope: 'always' })
      })
    )
  })

  it('rejects deny rules with model-facing feedback', async () => {
    const context = makeContext()
    const engine = new AgentPermissionEngine(
      makeConfig([
        {
          tool: 'execute_command',
          action: 'deny',
          rejectBehavior: 'reject_with_feedback',
          rejectFeedback: '只读模式：请改用 read_file 或只读命令，不要修改系统。'
        }
      ]),
      context
    )

    await expect(
      engine.ask({
        permission: 'execute_command',
        pattern: 'rm -rf /tmp/demo',
        riskLevel: 'high',
        reason: 'cleanup'
      })
    ).rejects.toThrow('只读模式')

    expect(context.requestAuthorization).not.toHaveBeenCalled()
    expect(mocks.approvalDB.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', command: 'rm -rf /tmp/demo' })
    )
    expect(mocks.agentRunStore.updatePart).toHaveBeenCalledWith(
      'permission-part-1',
      expect.objectContaining({
        status: 'error',
        metadata: expect.objectContaining({
          approved: false,
          feedback: '只读模式：请改用 read_file 或只读命令，不要修改系统。'
        })
      })
    )
  })

  it('records user approval scope without mutating agent config permissions', async () => {
    const context = makeContext()
    vi.mocked(context.requestAuthorization).mockResolvedValue({
      approved: true,
      alwaysAllow: true,
      scope: 'topic'
    })
    const config = makeConfig([{ tool: 'websearch', action: 'ask' }])
    const engine = new AgentPermissionEngine(config, context)

    const response = await engine.ask({
      permission: 'websearch',
      pattern: '今日新闻 2025年1月20日 重要事件',
      riskLevel: 'medium',
      reason: 'confirm web search'
    })

    expect(response).toEqual({ approved: true, alwaysAllow: true, scope: 'topic' })
    expect(context.requestAuthorization).toHaveBeenCalledTimes(1)
    expect(config.permissions).toEqual([{ tool: 'websearch', action: 'ask' }])
    expect(mocks.agentRunStore.updatePart).toHaveBeenLastCalledWith(
      'permission-part-1',
      expect.objectContaining({
        status: 'completed',
        metadata: expect.objectContaining({ alwaysAllow: true, scope: 'topic' })
      })
    )
  })
})
