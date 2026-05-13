import { describe, expect, it, vi } from 'vitest'
import type { Tool } from '../tool-factory'
import type { TerminalScreenSnapshot } from '../../terminal'

const mocks = vi.hoisted(() => ({
  sendAgentInput: vi.fn(),
  waitForTerminalActivity: vi.fn(),
  waitForTerminalText: vi.fn(),
  getTerminalSnapshot: vi.fn(),
  getTerminalHistory: vi.fn(),
  ensureSession: vi.fn(),
  requestAuthorization: vi.fn()
}))

vi.mock('../../db', () => ({
  terminalSessionDB: {
    createSession: vi.fn(),
    updateSessionShellIntegration: vi.fn(),
    closeSession: vi.fn(),
    getSessionsByTopic: vi.fn(() => [])
  },
  terminalIODB: {
    createIO: vi.fn(),
    markIOAsDeletedBySession: vi.fn(),
    getIOBySession: vi.fn(() => []),
    getOutputByRelatedInput: vi.fn()
  },
  topicDB: {
    getTopicById: vi.fn(() => ({ hostIds: [] }))
  },
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
  permissionDB: {
    getPermissions: vi.fn(() => ({ permissionMode: 'full_access', updatedAt: 1 }))
  },
  commandPatternDB: {
    getPatternByHostAndPattern: vi.fn()
  }
}))

vi.mock('../../terminal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../terminal')>()
  return {
    ...actual,
    commandExecutor: {
      ...actual.commandExecutor,
      sendAgentInput: mocks.sendAgentInput,
      waitForTerminalActivity: mocks.waitForTerminalActivity,
      waitForTerminalText: mocks.waitForTerminalText,
      getTerminalSnapshot: mocks.getTerminalSnapshot,
      getTerminalHistory: mocks.getTerminalHistory
    }
  }
})

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../../PolicyEngine', () => ({
  PolicyEngine: {
    evaluateWithTrust: vi.fn(() => ({
      action: 'allow',
      riskLevel: 'low',
      riskCategory: 'read',
      requiresVerification: false,
      commandPattern: 'npm run dev'
    })),
    normalizeCommand: vi.fn((command: string) => command)
  }
}))

import {
  encodeTerminalInput,
  interactTerminalTool,
  startInteractiveCommandTool,
  waitTerminalTextTool
} from '../terminal-automation'

function snapshot(overrides: Partial<TerminalScreenSnapshot> = {}): TerminalScreenSnapshot {
  return {
    sessionId: 'session-1',
    hostId: 'local',
    hostAlias: '本机',
    cols: 80,
    rows: 24,
    cursorX: 0,
    cursorY: 1,
    bufferType: 'alternate' as const,
    viewportY: 0,
    baseY: 0,
    isLocked: false,
    lockedBy: null,
    isCommandRunning: false,
    updatedAt: 10,
    lines: [
      { row: 0, text: 'Menu', wrapped: false },
      { row: 1, text: '> Continue', wrapped: false }
    ],
    visibleText: 'Menu\n> Continue',
    phase: 'awaiting_input' as const,
    phaseConfidence: 'high' as const,
    inputHints: ['confirm_choice'],
    menuLike: true,
    hasSpinner: false,
    hasProgress: false,
    visibleTextHash: 'hash',
    ...overrides
  }
}

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

describe('terminal automation tools', () => {
  it('encodes text and special keys for TUI automation', () => {
    const encoded = encodeTerminalInput({
      sessionId: 'session-1',
      text: 'sudo tasksel',
      keys: ['Enter'],
      reason: 'start interactive installer'
    })

    expect(encoded.data).toBe('sudo tasksel\r')
    expect(encoded.recordedContent).toContain('text "sudo tasksel"')
    expect(encoded.recordedContent).toContain('key Enter')
  })

  it('appends Enter once when submit is true', () => {
    const encoded = encodeTerminalInput({
      sessionId: 'session-1',
      text: 'Analyze the project structure',
      submit: true,
      reason: 'submit prompt'
    })

    expect(encoded.data).toBe('Analyze the project structure\r')
    expect(encoded.recordedContent).toContain('key Enter')

    const withExplicitEnter = encodeTerminalInput({
      sessionId: 'session-1',
      text: 'Analyze the project structure',
      submit: true,
      keys: ['Enter'],
      reason: 'submit prompt'
    })
    expect(withExplicitEnter.data).toBe('Analyze the project structure\r')
  })

  it('preserves ordered text/key sequences', () => {
    const encoded = encodeTerminalInput({
      sessionId: 'session-1',
      sequence: [{ key: 'ArrowDown' }, { key: 'Space' }, { text: 'y' }, { key: 'Enter' }],
      reason: 'select a menu item'
    })

    expect(encoded.data).toBe('\x1b[B y\r')
    expect(encoded.recordedContent).toContain('key ArrowDown')
    expect(encoded.recordedContent).toContain('key Space')
  })

  it('rejects raw escape control characters in text input', () => {
    expect(() =>
      encodeTerminalInput({
        sessionId: 'session-1',
        text: '\x1b[A',
        reason: 'bad raw escape'
      })
    ).toThrow(/control characters/i)
  })

  it('accepts long waits up to 300000ms for terminal text waits', async () => {
    const tool = await waitTerminalTextTool.init()

    mocks.waitForTerminalText.mockRejectedValueOnce(new Error('Session not found'))

    await expect(
      tool.execute(
        {
          sessionId: 'missing-session',
          text: 'Research Report',
          timeoutMs: 180000,
          stableMs: 0,
          reason: 'long TUI task'
        },
        { abort: new AbortController().signal, topicId: 'topic-1' } as never
      )
    ).rejects.toThrow(/Session not found/)
  })

  it('starts an interactive command in a visible interactive terminal', async () => {
    mocks.ensureSession.mockResolvedValueOnce('session-1')
    mocks.sendAgentInput.mockResolvedValueOnce(undefined)
    mocks.waitForTerminalActivity.mockResolvedValueOnce({
      status: 'awaiting_input',
      screenPhase: 'awaiting_input',
      matched: false,
      timedOut: false,
      elapsedMs: 120,
      idleMs: 500,
      snapshot: snapshot(),
      history: []
    })

    const tool = await startInteractiveCommandTool.init()
    const result = await tool.execute(
      {
        hostId: 'local',
        terminalName: 'installer',
        command: 'npm run dev',
        workdir: '/tmp/project',
        waitForInitialActivity: true,
        initialWaitMs: 1000,
        reason: 'start dev TUI'
      },
      makeContext()
    )

    expect(mocks.ensureSession).toHaveBeenCalledWith('local', '本机', 'installer', {
      role: 'interactive',
      visible: true
    })
    expect(mocks.sendAgentInput).toHaveBeenCalledWith(
      'session-1',
      "cd '/tmp/project' && npm run dev\r",
      'topic-1',
      'start interactive command "cd \'/tmp/project\' && npm run dev"',
      'task-1',
      'step-1'
    )
    expect(result.metadata).toMatchObject({
      sessionId: 'session-1',
      terminalRole: 'interactive',
      startedInteractiveCommand: true
    })
    expect(result.output).toContain('initialStatus: awaiting_input')
  })

  it('sends input and waits for terminal activity in one interaction', async () => {
    mocks.getTerminalHistory.mockResolvedValueOnce([{ updatedAt: 5 }])
    mocks.sendAgentInput.mockResolvedValueOnce(undefined)
    mocks.waitForTerminalActivity.mockResolvedValueOnce({
      status: 'stable_output',
      screenPhase: 'stable_output',
      matched: false,
      timedOut: false,
      elapsedMs: 250,
      idleMs: 500,
      snapshot: snapshot({ phase: 'stable_output', visibleText: 'Done' }),
      history: [
        {
          updatedAt: 10,
          hash: 'h',
          cursorX: 0,
          cursorY: 0,
          bufferType: 'normal',
          cols: 80,
          rows: 24,
          changedLines: [],
          excerpt: 'Done'
        }
      ]
    })

    const tool = await interactTerminalTool.init()
    const result = await tool.execute(
      {
        sessionId: 'session-1',
        text: 'y',
        submit: true,
        waitFor: 'activity',
        timeoutMs: 1000,
        idleMs: 500,
        stableMs: 0,
        requireFreshMatch: true,
        includeHistory: true,
        reason: 'confirm prompt'
      },
      makeContext()
    )

    expect(mocks.sendAgentInput).toHaveBeenCalledWith(
      'session-1',
      'y\r',
      'topic-1',
      'text "y", key Enter',
      'task-1',
      'step-1'
    )
    expect(mocks.waitForTerminalActivity).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ timeoutMs: 1000, idleMs: 500, returnOnIdle: false }),
      expect.any(AbortSignal)
    )
    expect(result.metadata).toMatchObject({
      waitFor: 'activity',
      status: 'stable_output',
      recordedContent: 'text "y", key Enter'
    })
    expect(result.output).toContain('Terminal screen stabilized')
  })
})
