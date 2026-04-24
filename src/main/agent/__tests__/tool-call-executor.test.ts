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

function toolCall(args: Record<string, unknown>): ChatCompletionMessageFunctionToolCall {
  return {
    id: 'call-1',
    type: 'function',
    function: {
      name: 'validated_tool',
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
})
