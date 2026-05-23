import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AgentPart, AgentRun, Message } from '../../../shared/types'
import type { StreamChunk } from '../provider-adapter'
import { define } from '../../tools/tool-factory'
import { ToolRegistry } from '../../tools/tool-registry'
import { AgentLoop } from '../agent-loop'
import { getDefaultAgentConfig } from '../agent-config'
import { AGENT_CHECKPOINT_SCHEMA_VERSION } from '../agent-checkpoint'
import { AgentRunState } from '../agent-run-state'

type ExecuteCommandMock = ReturnType<
  typeof vi.fn<
    (args: { hostId: string; command: string; reason?: string }) => Promise<{
      output: string
      metadata: Record<string, unknown>
    }>
  >
>

const mocks = vi.hoisted(() => {
  let partCount = 0
  const parts: AgentPart[] = []
  return {
    parts,
    reset: () => {
      partCount = 0
      parts.length = 0
    },
    commandExecutor: {
      buildTerminalContext: vi.fn(() => ''),
      buildTerminalScreenSummary: vi.fn(async () => 'screen')
    },
    memoryManager: {
      recallRelevantContext: vi.fn(async () => '')
    },
    agentRunStore: {
      getParts: vi.fn(() => parts),
      getPart: vi.fn((id: string) => parts.find((part) => part.id === id)),
      createPart: vi.fn((input: Partial<AgentPart>) => {
        const part = {
          id: input.id ?? `part-${++partCount}`,
          runId: input.runId ?? 'run-1',
          type: input.type ?? 'text',
          status: input.status ?? 'pending',
          role: input.role,
          toolName: input.toolName,
          toolCallId: input.toolCallId,
          input: input.input,
          output: input.output,
          error: input.error,
          metadata: input.metadata,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          orderIndex: partCount,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as AgentPart
        parts.push(part)
        return part
      }),
      updatePart: vi.fn((id: string, updates: Partial<AgentPart>) => {
        const part = parts.find((item) => item.id === id)
        if (!part) return undefined
        Object.assign(part, updates, {
          metadata:
            updates.metadata === undefined
              ? part.metadata
              : { ...(part.metadata ?? {}), ...updates.metadata },
          updatedAt: Date.now()
        })
        return part
      }),
      updateRun: vi.fn(),
      completeRun: vi.fn()
    },
    taskStepDB: {
      createStep: vi.fn(() => ({
        id: `step-${partCount}`,
        taskId: 'task-1',
        type: 'command',
        status: 'running',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })),
      updateStep: vi.fn()
    },
    messageDB: {
      createMessage: vi.fn()
    },
    taskDB: {
      updateTask: vi.fn()
    },
    checkpointDB: {
      getCheckpoint: vi.fn(),
      upsertCheckpoint: vi.fn(),
      deleteCheckpoint: vi.fn()
    },
    eventBus: {
      publish: vi.fn()
    }
  }
})

vi.mock('../../terminal', () => ({
  commandExecutor: mocks.commandExecutor
}))

vi.mock('../../MemoryManager', () => ({
  MemoryManager: mocks.memoryManager
}))

vi.mock('../agent-run-store', () => ({
  agentRunStore: mocks.agentRunStore
}))

vi.mock('../../db', () => ({
  taskStepDB: mocks.taskStepDB,
  messageDB: mocks.messageDB,
  taskDB: mocks.taskDB,
  agentRunCheckpointDB: mocks.checkpointDB
}))

vi.mock('../event-bus', () => ({
  eventBus: mocks.eventBus
}))

function makeRun(): AgentRun {
  return {
    id: 'run-1',
    topicId: 'topic-1',
    taskId: 'task-1',
    agentName: 'build',
    mode: 'primary',
    status: 'running',
    goal: 'test repeated loop',
    createdAt: 1,
    updatedAt: 1
  }
}

function userMessage(): Message {
  return {
    id: 'msg-1',
    topicId: 'topic-1',
    role: 'user',
    content: 'check it',
    timestamp: 1
  }
}

function streamToolCall(id: string, command: string): StreamChunk[] {
  const args = JSON.stringify({ hostId: 'h1', command, reason: `reason ${id}` })
  return [
    {
      content: null,
      toolCalls: [
        {
          index: command === 'pwd' ? 0 : 1,
          id,
          type: 'function',
          function: { name: 'execute_command', arguments: args }
        }
      ],
      finishReason: null
    },
    {
      content: null,
      finishReason: 'tool_calls',
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
    }
  ]
}

function createRegistry(execute: ExecuteCommandMock): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(
    define('execute_command', {
      description: 'Mock command',
      parameters: z.object({
        hostId: z.string(),
        command: z.string(),
        reason: z.string().optional()
      }),
      execute
    })
  )
  return registry
}

function createProvider(stream: ReturnType<typeof vi.fn>): {
  stream: ReturnType<typeof vi.fn>
  getSessionUsage: ReturnType<typeof vi.fn>
  mergeChildUsage: ReturnType<typeof vi.fn>
} {
  return {
    stream,
    getSessionUsage: vi.fn(() => ({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      llmCalls: stream.mock.calls.length
    })),
    mergeChildUsage: vi.fn()
  }
}

function createLoop(input: {
  registry: ToolRegistry
  provider: unknown
  resumeFromCheckpoint?: boolean
  maxSteps?: number
  abort?: AbortSignal
}): AgentLoop {
  return new AgentLoop({
    run: makeRun(),
    context: {
      topicId: 'topic-1',
      taskId: 'task-1',
      runId: 'run-1',
      webContents: {} as never,
      agentService: {} as never,
      ensureSession: vi.fn(),
      requestAuthorization: vi.fn(),
      notifyStep: vi.fn(),
      metadata: vi.fn(),
      abort: input.abort
    },
    config: { ...getDefaultAgentConfig(), maxSteps: input.maxSteps ?? 4 },
    toolRegistry: input.registry,
    provider: input.provider as never,
    permissionEngine: { isToolAllowed: vi.fn(() => true) } as never,
    persistFinalMessage: false,
    updateTaskStatus: false,
    resumeFromCheckpoint: input.resumeFromCheckpoint,
    contextBudget: { modelContextWindow: 20000, reserveTokens: 1000 }
  })
}

describe('AgentLoop raw event flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reset()
  })

  it('executes repeated tool batches while recording diagnostic ledger state', async () => {
    const execute = vi.fn(async () => ({
      output: 'same output',
      metadata: { hostId: 'h1', command: 'mock', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const stream = vi
      .fn()
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('a1', 'pwd')
        yield* streamToolCall('a2', 'ls')
      })
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('b1', 'pwd')
        yield* streamToolCall('b2', 'ls')
      })
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('c1', 'pwd')
        yield* streamToolCall('c2', 'ls')
      })
      .mockImplementationOnce(async function* () {
        yield { content: '已根据已有结果总结。', finishReason: null }
        yield {
          content: null,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
        }
      })

    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider })

    const result = await loop.process([userMessage()])

    expect(result.content).toBe('已根据已有结果总结。')
    expect(execute).toHaveBeenCalledTimes(6)
    expect(stream.mock.calls.map((call) => call[0].toolChoice)).toEqual(['auto', 'auto', 'auto', 'none'])
    const blockedParts = mocks.parts.filter((part) => part.status === 'blocked')
    expect(blockedParts).toHaveLength(0)
    const diagnosticParts = mocks.parts.filter(
      (part) => part.metadata?.repeatedToolCallDiagnostic === true
    )
    expect(diagnosticParts).toHaveLength(4)
    expect(diagnosticParts.at(-1)?.metadata).toMatchObject({
      repeatedToolCallDiagnostic: true,
      repeatedToolCallCount: 3
    })
    const lastCheckpointPayload =
      mocks.checkpointDB.upsertCheckpoint.mock.calls.at(-1)?.[1] as
        | {
            state?: {
              events?: Array<{ type: string }>
              toolLedger?: Array<{ repeatCount: number }>
            }
          }
        | undefined
    expect(
      lastCheckpointPayload?.state?.toolLedger?.reduce(
        (sum, entry) => sum + entry.repeatCount,
        0
      )
    ).toBe(4)
    expect(lastCheckpointPayload?.state?.events?.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_call_requested',
      'tool_result',
      'tool_result',
      'assistant_response',
      'tool_call_requested',
      'tool_call_requested',
      'tool_result',
      'tool_result',
      'assistant_response',
      'tool_call_requested',
      'tool_call_requested',
      'tool_result',
      'tool_result',
      'assistant_response',
      'final'
    ])
  })

  it('reconciles completed persisted tool parts before asking the model on resume', async () => {
    const execute = vi.fn(async () => ({
      output: 'should not run',
      metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const state = new AgentRunState({ workingHistory: [userMessage()], turnCount: 1 })
    state.appendAssistantResponse({
      turn: 1,
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' })
          }
        }
      ]
    })
    mocks.checkpointDB.getCheckpoint.mockReturnValue({
      runId: 'run-1',
      payload: {
        schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
        state: state.snapshot(),
        updatedAt: 123
      }
    })
    mocks.parts.push({
      id: 'tool-part-1',
      runId: 'run-1',
      type: 'tool',
      status: 'completed',
      role: 'tool',
      toolName: 'execute_command',
      toolCallId: 'call-1',
      input: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' }),
      output: 'persisted pwd output',
      orderIndex: 1,
      createdAt: 1,
      updatedAt: 1
    } as AgentPart)

    const stream = vi.fn().mockImplementationOnce(async function* () {
      yield { content: 'done after persisted observation', finishReason: null }
      yield {
        content: null,
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
      }
    })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, resumeFromCheckpoint: true, maxSteps: 3 })

    const result = await loop.process([userMessage()])

    expect(result.content).toBe('done after persisted observation')
    expect(execute).not.toHaveBeenCalled()
    expect(stream).toHaveBeenCalledTimes(1)
    expect(stream.mock.calls[0][0].messages.map((item: { role: string }) => item.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool'
    ])
    expect(
      stream.mock.calls[0][0].messages.find(
        (item: { role: string; content?: unknown }) => item.role === 'tool'
      )?.content
    ).toBe('persisted pwd output')
  })

  it('finishes when the model returns final content even if stale verification is pending', async () => {
    const execute = vi.fn(async () => ({
      output: 'write output',
      metadata: {
        hostId: 'h1',
        command: 'touch /tmp/demo',
        riskCategory: 'write',
        requiresVerification: true,
        exitCode: 0
      }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const stream = vi
      .fn()
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('write-1', 'touch /tmp/demo')
      })
      .mockImplementationOnce(async function* () {
        yield { content: '最终报告：已经完成。', finishReason: null }
        yield {
          content: null,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
        }
      })
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('should-not-run', 'ls /tmp/demo')
      })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, maxSteps: 4 })

    const result = await loop.process([userMessage()])

    expect(result.content).toBe('最终报告：已经完成。')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stream).toHaveBeenCalledTimes(2)
    expect(stream.mock.calls.map((call) => call[0].toolChoice)).toEqual(['auto', 'auto'])
    const lastCheckpointPayload =
      mocks.checkpointDB.upsertCheckpoint.mock.calls.at(-1)?.[1] as
        | {
            state?: {
              events?: Array<{ type: string; content?: string }>
              pendingVerifications?: unknown[]
            }
          }
        | undefined
    expect(lastCheckpointPayload?.state?.events?.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_result',
      'assistant_response',
      'final'
    ])
    expect(lastCheckpointPayload?.state?.pendingVerifications).toHaveLength(1)
  })

  it('recovers once from an empty assistant response instead of surfacing terminal dump text', async () => {
    const execute = vi.fn(async () => ({
      output: 'tool output',
      metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const stream = vi
      .fn()
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('call-1', 'pwd')
      })
      .mockImplementationOnce(async function* () {
        yield {
          content: null,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
        }
      })
      .mockImplementationOnce(async function* () {
        yield { content: '根据已有输出继续总结。', finishReason: null }
        yield {
          content: null,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
        }
      })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, maxSteps: 4 })

    const result = await loop.process([userMessage()])

    expect(result.content).toBe('根据已有输出继续总结。')
    expect(mocks.commandExecutor.buildTerminalScreenSummary).not.toHaveBeenCalled()
    expect(stream).toHaveBeenCalledTimes(3)
    expect(stream.mock.calls[2][0].messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('上一轮模型没有输出正文')
    })
    const lastCheckpointPayload =
      mocks.checkpointDB.upsertCheckpoint.mock.calls.at(-1)?.[1] as
        | {
            state?: {
              events?: Array<{ type: string; content?: string }>
            }
          }
        | undefined
    expect(lastCheckpointPayload?.state?.events?.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_result',
      'assistant_response',
      'runtime_observation',
      'assistant_response',
      'final'
    ])
  })

  it('keeps restored model context aligned to persisted observation metadata', async () => {
    const execute = vi.fn(async () => ({
      output: 'should not run',
      metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const state = new AgentRunState({ workingHistory: [userMessage()], turnCount: 1 })
    state.appendAssistantResponse({
      turn: 1,
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' })
          }
        }
      ]
    })
    mocks.checkpointDB.getCheckpoint.mockReturnValue({
      runId: 'run-1',
      payload: {
        schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
        state: state.snapshot(),
        updatedAt: 123
      }
    })
    mocks.parts.push({
      id: 'tool-part-1',
      runId: 'run-1',
      type: 'tool',
      status: 'completed',
      role: 'tool',
      toolName: 'execute_command',
      toolCallId: 'call-1',
      input: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' }),
      output: '{"content":"persisted pwd output","exitCode":0}',
      metadata: { observation: 'Exit 0\npersisted pwd output' },
      orderIndex: 1,
      createdAt: 1,
      updatedAt: 1
    } as AgentPart)

    const stream = vi.fn().mockImplementationOnce(async function* () {
      yield { content: 'done after persisted observation', finishReason: null }
      yield {
        content: null,
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
      }
    })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, resumeFromCheckpoint: true, maxSteps: 3 })

    await loop.process([userMessage()])

    expect(execute).not.toHaveBeenCalled()
    expect(
      stream.mock.calls[0][0].messages.find(
        (item: { role: string; content?: unknown }) => item.role === 'tool'
      )?.content
    ).toBe('Exit 0\npersisted pwd output')
  })

  it('executes pending checkpoint tool calls before streaming the next model turn on resume', async () => {
    const execute = vi.fn(async () => ({
      output: 'fresh tool output',
      metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const state = new AgentRunState({ workingHistory: [userMessage()], turnCount: 1 })
    state.appendAssistantResponse({
      turn: 1,
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' })
          }
        }
      ]
    })
    mocks.checkpointDB.getCheckpoint.mockReturnValue({
      runId: 'run-1',
      payload: {
        schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
        state: state.snapshot(),
        updatedAt: 123
      }
    })

    const stream = vi.fn().mockImplementationOnce(async function* () {
      yield { content: 'done after fresh observation', finishReason: null }
      yield {
        content: null,
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 }
      }
    })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, resumeFromCheckpoint: true, maxSteps: 3 })

    const result = await loop.process([userMessage()])

    expect(result.content).toBe('done after fresh observation')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stream).toHaveBeenCalledTimes(1)
    expect(stream.mock.calls[0][0].messages.map((item: { role: string }) => item.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool'
    ])
  })

  it('stops after tool execution when the run is cancelled mid-tool phase', async () => {
    const abortController = new AbortController()
    const execute = vi.fn(async () => {
      abortController.abort()
      return {
        output: 'cancelled after command',
        metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
      }
    })
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const stream = vi
      .fn()
      .mockImplementationOnce(async function* () {
        yield* streamToolCall('call-1', 'pwd')
      })
      .mockImplementationOnce(async function* () {
        yield { content: 'should not stream again', finishReason: null }
      })
    const provider = createProvider(stream)
    const loop = createLoop({
      registry,
      provider,
      maxSteps: 3,
      abort: abortController.signal
    })

    const result = await loop.process([userMessage()])

    expect(result.metadata?.agentStatus).toBe('cancelled')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stream).toHaveBeenCalledTimes(1)
    const lastCheckpointPayload =
      mocks.checkpointDB.upsertCheckpoint.mock.calls.at(-1)?.[1] as
        | {
            state?: {
              events?: Array<{ type: string; content?: string }>
            }
          }
        | undefined
    expect(lastCheckpointPayload?.state?.events?.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_result',
      'error'
    ])
  })

  it('treats provider aborts as cancelled runs instead of provider failures', async () => {
    const execute = vi.fn(async () => ({
      output: 'unused',
      metadata: { hostId: 'h1', command: 'pwd', riskCategory: 'read', exitCode: 0 }
    }))
    const registry = createRegistry(execute)
    await registry.initializeTools('build')

    const stream = vi.fn().mockImplementationOnce(async function* () {
      yield { content: 'partial text', finishReason: null }
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })
    const provider = createProvider(stream)
    const loop = createLoop({ registry, provider, maxSteps: 2 })

    const result = await loop.process([userMessage()])

    expect(result.metadata?.agentStatus).toBe('cancelled')
    expect(mocks.agentRunStore.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'cancelled',
        usage: expect.objectContaining({ stopReason: 'aborted' })
      })
    )
    expect(mocks.eventBus.publish).toHaveBeenCalledWith(
      'agent:task-complete',
      expect.objectContaining({ status: 'cancelled' })
    )
    const lastCheckpointPayload =
      mocks.checkpointDB.upsertCheckpoint.mock.calls.at(-1)?.[1] as
        | {
            state?: {
              events?: Array<{ type: string; content?: string }>
            }
          }
        | undefined
    const lastEvent = lastCheckpointPayload?.state?.events?.at(-1)
    expect(lastEvent).toMatchObject({
      type: 'error',
      content: 'aborted'
    })
  })
})
