import { describe, expect, it, vi } from 'vitest'
import type { Tool } from '../tool-factory'

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  executeAgentCommand: vi.fn(),
  ensureSession: vi.fn()
}))

vi.mock('../../command-runner', () => ({
  commandRunner: {
    run: mocks.run
  }
}))

vi.mock('../../terminal', () => ({
  commandExecutor: {
    executeAgentCommand: mocks.executeAgentCommand
  }
}))

vi.mock('../../db', () => ({
  hostDB: {
    getHosts: vi.fn(() => [
      {
        id: 'local',
        alias: '本机',
        ip: 'localhost',
        port: 22,
        username: 'local',
        tags: [],
        createdAt: 1
      }
    ])
  },
  taskStepDB: {
    updateStep: vi.fn()
  },
  approvalDB: {
    createApproval: vi.fn()
  },
  permissionDB: {
    getPermissions: vi.fn(() => ({ permissionMode: 'full_access', updatedAt: 1 }))
  },
  commandPatternDB: {
    getPatternByHostAndPattern: vi.fn(),
    createCommandPattern: vi.fn(),
    incrementApprovalCount: vi.fn(),
    incrementRejectionCount: vi.fn()
  }
}))

vi.mock('../../PolicyEngine', () => ({
  PolicyEngine: {
    evaluateWithTrust: vi.fn(() => ({
      action: 'allow',
      riskLevel: 'low',
      riskCategory: 'read',
      requiresVerification: false,
      commandPattern: 'echo *'
    })),
    normalizeCommand: vi.fn((command: string) => command)
  }
}))

vi.mock('../truncation', () => ({
  truncateOutput: vi.fn((text: string) => ({ content: text, truncated: false }))
}))

import executeCommandTool from '../execute-command'

function makeContext(): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    runId: 'run-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: mocks.ensureSession,
    requestAuthorization: vi.fn(),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    ask: vi.fn(),
    abort: new AbortController().signal,
    messages: [],
    agent: 'build',
    updatePartMetadata: vi.fn(),
    updatePart: vi.fn()
  }
}

describe('execute_command tool', () => {
  it('uses a visible agent command terminal and does not call hidden CommandRunner', async () => {
    mocks.ensureSession.mockResolvedValueOnce('session-1')
    mocks.executeAgentCommand.mockResolvedValueOnce({
      content: 'ok\n',
      exitCode: 0,
      durationMs: 12,
      timedOut: false,
      isTruncated: false,
      sessionId: 'session-1',
      cwd: '/tmp/project'
    })

    const tool = await executeCommandTool.init()
    const result = await tool.execute(
      {
        hostId: 'local',
        command: 'echo ok',
        workdir: '/tmp/project',
        timeoutMs: 1234,
        reason: 'check visible terminal runner'
      },
      makeContext()
    )

    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.ensureSession).toHaveBeenCalledWith('local', '本机', undefined, {
      role: 'agent_command',
      visible: true
    })
    expect(mocks.executeAgentCommand).toHaveBeenCalledWith(
      'session-1',
      "cd '/tmp/project' && echo ok",
      'topic-1',
      'task-1',
      'step-1',
      expect.objectContaining({ timeoutMs: 1234 })
    )
    expect(JSON.parse(result.output)).toMatchObject({
      content: 'ok\n',
      combinedOutput: 'ok\n',
      exitCode: 0,
      timedOut: false,
      workdir: '/tmp/project',
      sessionId: 'session-1',
      displayMode: 'terminal',
      terminalRole: 'agent_command',
      isTruncated: false
    })
  })

  it('records policy analysis and command segments in part metadata', async () => {
    mocks.ensureSession.mockResolvedValueOnce('session-1')
    mocks.executeAgentCommand.mockResolvedValueOnce({
      content: 'done\n',
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
      isTruncated: false,
      sessionId: 'session-1'
    })
    const context = makeContext()

    const tool = await executeCommandTool.init()
    await tool.execute(
      {
        hostId: 'local',
        command: 'echo ok && systemctl status nginx',
        timeoutMs: 1234,
        reason: 'capture metadata'
      },
      context
    )

    expect(context.updatePartMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: 'low',
        riskCategory: 'read',
        commandPattern: 'echo *',
        commandSegments: [
          { index: 0, raw: 'echo ok', command: 'echo', args: ['ok'] },
          {
            index: 1,
            raw: 'systemctl status nginx',
            command: 'systemctl',
            args: ['status', 'nginx']
          }
        ]
      })
    )
  })
})
