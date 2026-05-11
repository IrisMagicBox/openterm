import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tool } from '../tool-factory'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  ensureSession: vi.fn(async () => 'session-1'),
  requestAuthorization: vi.fn(),
  evaluateWithTrust: vi.fn(),
  normalizeCommand: vi.fn((command: string) => `normalized:${command}`),
  getPermissions: vi.fn()
}))

vi.mock('../../utils/host-resolver', () => ({
  resolveHostId: vi.fn(() => ({ id: 'local', alias: 'Local' }))
}))

vi.mock('../../terminal', () => ({
  commandExecutor: {
    execute: mocks.execute
  }
}))

vi.mock('../../PolicyEngine', () => ({
  PolicyEngine: {
    evaluateWithTrust: mocks.evaluateWithTrust,
    normalizeCommand: mocks.normalizeCommand
  }
}))

vi.mock('../../db', () => ({
  permissionDB: {
    getPermissions: mocks.getPermissions
  }
}))

vi.mock('../truncation', () => ({
  truncateOutput: vi.fn((text: string) => ({ content: text, truncated: false }))
}))

import readFileTool from '../read-file'
import grepTool from '../grep'
import globTool from '../glob'
import lsTool from '../ls'

function makeContext(): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    runId: 'run-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: mocks.ensureSession,
    requestAuthorization: mocks.requestAuthorization,
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

function allowReadPolicy(commandPattern?: string): Record<string, unknown> {
  return {
    action: 'allow',
    riskLevel: 'low',
    riskCategory: 'read',
    requiresVerification: false,
    commandPattern
  }
}

describe('read shell tools authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPermissions.mockReturnValue({ permissionMode: 'default', updatedAt: 1 })
    mocks.evaluateWithTrust.mockReturnValue(allowReadPolicy())
    mocks.requestAuthorization.mockResolvedValue({ approved: true, alwaysAllow: false })
    mocks.execute.mockResolvedValue({ content: 'ok\n', exitCode: 0 })
  })

  it('requires approval for read_file sensitive reads and records read metadata', async () => {
    mocks.evaluateWithTrust.mockReturnValueOnce({
      action: 'confirm',
      riskLevel: 'medium',
      riskCategory: 'read',
      requiresVerification: false,
      commandPattern: 'cat < {str}',
      reason: 'sensitive path'
    })
    const context = makeContext()
    const tool = await readFileTool.init()

    await tool.execute({ hostId: 'local', path: '/etc/passwd' }, context)

    expect(mocks.requestAuthorization).toHaveBeenCalledWith(
      "cat < '/etc/passwd'",
      'medium',
      '读取文件 /etc/passwd',
      expect.objectContaining({
        toolName: 'read_file',
        hostId: 'local',
        path: '/etc/passwd',
        riskCategory: 'read',
        commandPattern: 'cat < {str}',
        requiresVerification: false
      })
    )
  })

  it('returns an error without executing when read_file approval is rejected', async () => {
    mocks.evaluateWithTrust.mockReturnValueOnce({
      action: 'confirm',
      riskLevel: 'medium',
      riskCategory: 'read',
      requiresVerification: false,
      commandPattern: 'cat < {str}',
      reason: 'sensitive path'
    })
    mocks.requestAuthorization.mockResolvedValueOnce({ approved: false, alwaysAllow: false })
    const tool = await readFileTool.init()

    const result = await tool.execute({ hostId: 'local', path: '/root/secret' }, makeContext())

    expect(result.output).toContain('Error: User rejected read_file authorization')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('quotes grep pattern, path, include, and exclude values before execution', async () => {
    const tool = await grepTool.init()

    await tool.execute(
      {
        hostId: 'local',
        pattern: '$(touch /tmp/pwned)',
        path: '/tmp/has spaces',
        include: '`touch nope`*.ts',
        exclude: "node'$(touch nope)'modules",
        maxResults: 25
      },
      makeContext()
    )

    expect(mocks.execute).toHaveBeenCalledWith(
      'session-1',
      "grep -n -r --include='`touch nope`*.ts' --exclude-dir='node'\\''$(touch nope)'\\''modules' -- '$(touch /tmp/pwned)' '/tmp/has spaces' | head -n 25",
      'topic-1',
      'task-1'
    )
  })

  it('quotes glob pattern and path values before execution', async () => {
    const tool = await globTool.init()

    await tool.execute(
      {
        hostId: 'local',
        pattern: '`touch nope`*.ts',
        path: '/tmp/$(touch pwn)',
        maxResults: 7
      },
      makeContext()
    )

    expect(mocks.execute).toHaveBeenCalledWith(
      'session-1',
      "find '/tmp/$(touch pwn)' -type f -name '`touch nope`*.ts' 2>/dev/null | head -n 7",
      'topic-1',
      'task-1'
    )
  })

  it('quotes ls paths before execution', async () => {
    const tool = await lsTool.init()

    await tool.execute(
      { hostId: 'local', path: '/tmp/$(touch pwn)', details: true, showHidden: true },
      makeContext()
    )

    expect(mocks.execute).toHaveBeenCalledWith(
      'session-1',
      "ls -l -a -- '/tmp/$(touch pwn)' 2>/dev/null",
      'topic-1',
      'task-1'
    )
  })
})
