import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import type { AgentProcessorOptions } from '../agent-processor-types'
import type { AgentPart, TaskStep } from '../../../shared/types'

const mocks = vi.hoisted(() => {
  let partCount = 0
  return {
    resetPartCount: () => {
      partCount = 0
    },
    agentRunStore: {
      getParts: vi.fn(() => []),
      createPart: vi.fn((input: Partial<AgentPart>) => ({
        id: `part-${++partCount}`,
        runId: input.runId ?? 'run-1',
        type: input.type ?? 'tool',
        status: input.status ?? 'pending',
        orderIndex: partCount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...input
      })),
      updatePart: vi.fn(),
      updateRun: vi.fn()
    },
    taskStepDB: {
      createStep: vi.fn(
        (input: Partial<TaskStep>) =>
          ({
            id: 'step-1',
            taskId: input.taskId ?? 'task-1',
            type: input.type ?? 'command',
            status: input.status ?? 'running',
            content: input.content ?? '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...input
          }) as TaskStep
      ),
      updateStep: vi.fn()
    },
    eventBus: {
      publish: vi.fn()
    }
  }
})

vi.mock('../agent-run-store', () => ({
  agentRunStore: mocks.agentRunStore
}))

vi.mock('../../db', () => ({
  taskStepDB: mocks.taskStepDB
}))

vi.mock('../event-bus', () => ({
  eventBus: mocks.eventBus
}))

import { define } from '../../tools/tool-factory'
import { ToolRegistry } from '../../tools/tool-registry'
import { ToolCallExecutor } from '../tool-call-executor'

function makeOptions(toolRegistry: ToolRegistry): AgentProcessorOptions {
  return {
    run: {
      id: 'run-1',
      topicId: 'topic-1',
      taskId: 'task-1',
      agentName: 'build',
      mode: 'primary',
      status: 'running',
      goal: 'test tool validation',
      createdAt: 1,
      updatedAt: 1
    },
    context: {
      topicId: 'topic-1',
      taskId: 'task-1',
      runId: 'run-1',
      webContents: {} as never,
      agentService: {} as never,
      ensureSession: vi.fn(),
      requestAuthorization: vi.fn(),
      notifyStep: vi.fn(),
      metadata: vi.fn()
    },
    config: {
      name: 'build',
      description: 'test',
      mode: 'primary',
      allowedTools: [],
      permissions: [{ tool: '*', allowed: true }]
    },
    toolRegistry,
    provider: {
      mergeChildUsage: vi.fn()
    } as never,
    permissionEngine: {
      isToolAllowed: vi.fn(() => true)
    } as never,
    persistFinalMessage: false,
    updateTaskStatus: false
  }
}

function toolCall(
  args: Record<string, unknown>,
  name = 'validated_tool',
  id = 'call-1'
): ChatCompletionMessageFunctionToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  }
}

describe('ToolCallExecutor schema validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetPartCount()
  })

  it('returns structured schema errors before creating legacy task steps', async () => {
    const registry = new ToolRegistry()
    registry.register(
      define('validated_tool', {
        description: 'Validated test tool',
        parameters: z.object({ count: z.number() }),
        execute: async (args) => ({ output: `count=${args.count}` })
      })
    )
    await registry.initializeTools('build')

    const executor = new ToolCallExecutor(makeOptions(registry))
    const observations = await executor.executeToolCalls([toolCall({ count: 'oops' })])

    expect(observations).toHaveLength(1)
    expect(JSON.parse(String(observations[0].content))).toMatchObject({
      type: 'schema_validation',
      tool: 'validated_tool',
      issues: [{ path: 'count' }]
    })
    expect(mocks.taskStepDB.createStep).not.toHaveBeenCalled()
    expect(mocks.agentRunStore.updatePart).toHaveBeenCalledWith(
      'part-1',
      expect.objectContaining({
        status: 'error',
        metadata: expect.objectContaining({
          schemaValidationError: expect.objectContaining({ type: 'schema_validation' })
        })
      })
    )
  })

  it('only clears pending verification when a read command carries matching verificationIds', async () => {
    const registry = new ToolRegistry()
    registry.register(
      define('write_tool', {
        description: 'Mutating test tool',
        parameters: z.object({ hostId: z.string() }),
        execute: async (args) => ({
          output: 'write ok',
          metadata: {
            hostId: args.hostId,
            command: 'write target',
            riskCategory: 'write',
            requiresVerification: true,
            exitCode: 0
          }
        })
      })
    )
    registry.register(
      define('execute_command', {
        description: 'Read command test tool',
        parameters: z.object({
          hostId: z.string(),
          command: z.string(),
          verificationIds: z.array(z.string()).optional()
        }),
        execute: async (args) => ({
          output: JSON.stringify({
            content: 'ok',
            exitCode: 0,
            durationMs: 1,
            isTruncated: false,
            sessionId: 's1'
          }),
          metadata: {
            hostId: args.hostId,
            command: args.command,
            riskCategory: 'read',
            requiresVerification: false,
            exitCode: 0
          }
        })
      })
    )
    await registry.initializeTools('build')

    const executor = new ToolCallExecutor(makeOptions(registry))
    const writeObservation = await executor.executeToolCalls([
      toolCall({ hostId: 'local' }, 'write_tool', 'write-1')
    ])

    expect(executor.hasPendingVerification()).toBe(true)
    expect(String(writeObservation[0].content)).toContain('verificationIds')

    const pendingObservation = executor.getVerificationObservation()
    const verificationId = pendingObservation.match(/verificationId=(ver_[\w-]+)/)?.[1]
    expect(verificationId).toBeDefined()

    await executor.executeToolCalls([
      toolCall({ hostId: 'local', command: 'pwd' }, 'execute_command', 'read-1')
    ])
    expect(executor.hasPendingVerification()).toBe(true)

    const clearObservation = await executor.executeToolCalls([
      toolCall(
        { hostId: 'local', command: 'ls', verificationIds: [verificationId] },
        'execute_command',
        'read-2'
      )
    ])
    expect(executor.hasPendingVerification()).toBe(false)
    expect(String(clearObservation[0].content)).toContain('已确认并清除验证项')
  })

  it('normalizes stale explicit dates in visible websearch arguments before recording parts', async () => {
    const registry = new ToolRegistry()
    registry.register(
      define('websearch', {
        description: 'Mock websearch',
        parameters: z.object({ query: z.string(), numResults: z.number().optional() }),
        execute: async (args) => ({ output: args.query })
      })
    )
    await registry.initializeTools('build')

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-06T12:00:00'))
    try {
      const executor = new ToolCallExecutor(makeOptions(registry))
      await executor.executeToolCalls([
        toolCall({ query: '今日新闻 时事 2025年7月15日', numResults: 10 }, 'websearch')
      ])

      const createdPart = mocks.agentRunStore.createPart.mock.calls[0][0] as Partial<AgentPart>
      expect(createdPart.input).toContain('今日新闻 时事 2026年5月6日')
      expect(createdPart.input).not.toContain('2025年7月15日')
    } finally {
      vi.useRealTimers()
    }
  })
})
