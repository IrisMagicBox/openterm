import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import type { AgentRunCheckpointV1Payload } from '../agent-checkpoint'
import { AgentRunState } from '../agent-run-state'

const mocks = vi.hoisted(() => ({
  agentRunCheckpointDB: {
    getCheckpoint: vi.fn(),
    upsertCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn()
  },
  agentRunStore: {
    updateRun: vi.fn()
  }
}))

vi.mock('../../db', () => ({
  agentRunCheckpointDB: mocks.agentRunCheckpointDB
}))

vi.mock('../agent-run-store', () => ({
  agentRunStore: mocks.agentRunStore
}))

import {
  AGENT_CHECKPOINT_SCHEMA_VERSION,
  AGENT_CHECKPOINT_SCHEMA_VERSION_V1,
  AgentCheckpointStore
} from '../agent-checkpoint'

function call(
  id: string,
  command: string,
  reason: string
): ChatCompletionMessageFunctionToolCall {
  return {
    id,
    type: 'function',
    function: {
      name: 'execute_command',
      arguments: JSON.stringify({ hostId: 'h1', command, reason })
    }
  }
}

describe('AgentCheckpointStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts v1 checkpoints to v2 state and restores ledger counts', () => {
    const legacyPayload: AgentRunCheckpointV1Payload = {
      schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION_V1,
      turnCount: 3,
      workingHistory: [
        {
          id: 'msg-1',
          topicId: 'topic-1',
          role: 'user',
          content: '继续',
          timestamp: 1
        }
      ],
      turnMessages: [
        {
          role: 'assistant',
          content: 'checking',
          tool_calls: [call('call-1', 'pwd', 'first')]
        },
        {
          role: 'tool',
          tool_call_id: 'call-1',
          content: 'first output'
        },
        {
          role: 'assistant',
          content: 'checking again',
          tool_calls: [call('call-2', 'pwd', 'second')]
        },
        {
          role: 'tool',
          tool_call_id: 'call-2',
          content: 'second output'
        }
      ],
      pendingVerifications: [],
      updatedAt: 123,
      lastCompactionMode: 'prune_only'
    }
    mocks.agentRunCheckpointDB.getCheckpoint.mockReturnValue({
      runId: 'run-1',
      payload: legacyPayload
    })

    const checkpoint = new AgentCheckpointStore().get('run-1')

    expect(checkpoint?.schemaVersion).toBe(AGENT_CHECKPOINT_SCHEMA_VERSION)
    expect(checkpoint?.updatedAt).toBe(123)
    expect(checkpoint?.state.turnCount).toBe(3)
    expect(checkpoint?.state.events.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_result',
      'assistant_response',
      'tool_call_requested',
      'tool_result'
    ])
    expect(checkpoint?.state.toolLedger).toHaveLength(1)
    expect(checkpoint?.state.toolLedger[0]).toMatchObject({
      count: 2,
      lastObservation: 'second output'
    })
    expect(checkpoint?.state.lastCompactionMode).toBe('prune_only')
  })

  it('saves only v2 payloads and writes checkpoint report metadata', () => {
    const state = new AgentRunState({
      turnCount: 4,
      workingHistory: [],
      pendingVerifications: [
        {
          id: 'ver_123',
          hostId: 'h1',
          toolName: 'execute_command',
          command: 'touch file',
          riskCategory: 'write',
          createdAt: 1
        }
      ],
      lastCompactionMode: 'summary'
    })
    state.appendAssistantResponse({
      turn: 1,
      content: 'checking',
      toolCalls: [call('call-1', 'pwd', 'first')]
    })
    state.ledger.registerAttempts(
      [{ call: call('call-1', 'pwd', 'first'), args: { hostId: 'h1', command: 'pwd' } }],
      1
    )
    state.ledger.recordObservation('execute_command', { hostId: 'h1', command: 'pwd' }, 'ok')

    const payload = new AgentCheckpointStore().save('run-1', {
      state: state.snapshot(),
      updatedAt: 456
    })

    expect(payload.schemaVersion).toBe(AGENT_CHECKPOINT_SCHEMA_VERSION)
    expect(mocks.agentRunCheckpointDB.upsertCheckpoint).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
        state: expect.objectContaining({
          events: expect.any(Array),
          toolLedger: expect.any(Array)
        })
      })
    )
    expect(mocks.agentRunCheckpointDB.upsertCheckpoint.mock.calls[0][1]).not.toHaveProperty(
      'turnMessages'
    )
    expect(mocks.agentRunStore.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        metadata: {
          latestCheckpointReport: expect.objectContaining({
            updatedAt: 456,
            turnCount: 4,
            eventCount: 2,
            compactedEventCount: 0,
            ledgerEntryCount: 1,
            repeatedToolCallCount: 0,
            pendingVerificationCount: 1,
            compactionMode: 'summary'
          })
        }
      })
    )
  })

  it('round-trips v2 checkpoints without dropping state fields', () => {
    const original = new AgentRunState({
      workingHistory: [],
      pendingVerifications: [
        {
          id: 'ver_1',
          hostId: 'h1',
          toolName: 'execute_command',
          command: 'write',
          riskCategory: 'write',
          createdAt: 1
        }
      ]
    })
    original.appendAssistantResponse({ turn: 1, content: 'hi', toolCalls: [] })
    const saved = new AgentCheckpointStore().save('run-1', {
      state: original.snapshot(),
      updatedAt: 789
    })
    mocks.agentRunCheckpointDB.getCheckpoint.mockReturnValue({ runId: 'run-1', payload: saved })

    const restored = new AgentCheckpointStore().get('run-1')

    expect(restored?.state.pendingVerifications[0].id).toBe('ver_1')
    expect(restored?.state.events[0].type).toBe('assistant_response')
    expect(restored?.schemaVersion).toBe(AGENT_CHECKPOINT_SCHEMA_VERSION)
  })
})
