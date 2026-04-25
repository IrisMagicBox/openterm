import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Tool } from '../../tools/tool-factory'

const mocks = vi.hoisted(() => ({
  constructed: [] as Array<{
    context: Record<string, unknown>
    agentName: string
    options: Record<string, unknown>
  }>,
  run: vi.fn(),
  getSessionUsage: vi.fn()
}))

vi.mock('../../AgentRunner', () => ({
  AgentRunner: vi.fn().mockImplementation(function (
    this: { run: typeof mocks.run; getSessionUsage: typeof mocks.getSessionUsage },
    context,
    agentName,
    options
  ) {
    mocks.constructed.push({ context, agentName, options })
    this.run = mocks.run
    this.getSessionUsage = mocks.getSessionUsage
  })
}))

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../event-bus', () => ({
  eventBus: {
    publish: vi.fn()
  }
}))

import taskTool from '../task-tool'

function makeContext(parentAbortController = new AbortController()): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    runId: 'parent-run',
    partId: 'parent-part',
    webContents: {} as never,
    agentService: {
      getSessions: vi.fn(async () => []),
      createTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      renameTerminal: vi.fn(),
      updateHostMetadata: vi.fn(),
      searchTopics: vi.fn(async () => []),
      searchMemories: vi.fn(async () => []),
      getTopicHosts: vi.fn(async () => []),
      registerRunController: vi.fn(),
      unregisterRunController: vi.fn()
    } as never,
    ensureSession: vi.fn(),
    requestAuthorization: vi.fn(async () => ({ approved: true, alwaysAllow: false })),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    ask: vi.fn(),
    abort: parentAbortController.signal,
    messages: [],
    agent: 'build',
    updatePartMetadata: vi.fn()
  }
}

describe('task tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.constructed.length = 0
    mocks.run.mockResolvedValue({
      id: 'msg-1',
      topicId: 'topic-1',
      role: 'assistant',
      content: 'child done',
      timestamp: Date.now()
    })
    mocks.getSessionUsage.mockReturnValue({
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      llmCalls: 0
    })
  })

  it('allows the read-only plan subagent in its schema', async () => {
    const info = await taskTool.init({ agent: 'build' })
    const parsed = info.parameters.parse({
      agent: 'plan',
      prompt: '拆解发布计划'
    })

    expect(parsed.agent).toBe('plan')
  })

  it('registers and unregisters the child run controller with resumable metadata', async () => {
    const context = makeContext()
    const tool = await taskTool.init()

    await tool.execute({ agent: 'explore', prompt: 'inspect files', hostId: 'local' }, context)

    const registerRunController = context.agentService.registerRunController as Mock
    const unregisterRunController = context.agentService.unregisterRunController as Mock
    const [childRunId, childController] = registerRunController.mock.calls[0]

    expect(childRunId).toMatch(/^sub_explore_/)
    expect(childController).toBeInstanceOf(AbortController)
    expect(unregisterRunController).toHaveBeenCalledWith(childRunId, childController)
    expect(mocks.constructed[0]).toMatchObject({
      agentName: 'explore',
      options: {
        runId: childRunId,
        parentRunId: 'parent-run',
        parentPartId: 'parent-part',
        persistFinalMessage: false,
        updateTaskStatus: false,
        goal: 'Focus on host local. inspect files',
        metadata: {
          originalPrompt: 'inspect files',
          scopedPrompt: 'Focus on host local. inspect files',
          hostId: 'local',
          childAgent: 'explore'
        }
      }
    })
  })

  it('aborts the child controller when the parent run is aborted', async () => {
    const parentAbortController = new AbortController()
    const context = makeContext(parentAbortController)
    mocks.run.mockImplementationOnce(async () => {
      const childContext = mocks.constructed[0].context
      expect((childContext.abort as AbortSignal).aborted).toBe(false)
      parentAbortController.abort()
      expect((childContext.abort as AbortSignal).aborted).toBe(true)
      return {
        id: 'msg-1',
        topicId: 'topic-1',
        role: 'assistant',
        content: 'child done',
        timestamp: Date.now()
      }
    })
    const tool = await taskTool.init()

    await tool.execute({ agent: 'verify', prompt: 'check service' }, context)

    expect(context.agentService.unregisterRunController).toHaveBeenCalled()
  })
})
