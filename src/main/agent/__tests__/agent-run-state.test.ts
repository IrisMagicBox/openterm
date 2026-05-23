import { describe, expect, it } from 'vitest'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import type { AgentPart, Message } from '../../../shared/types'
import { AgentRunState } from '../agent-run-state'

function message(role: Message['role'], content: string): Message {
  return {
    id: `${role}-1`,
    topicId: 'topic-1',
    role,
    content,
    timestamp: 1
  }
}

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

function part(input: Partial<AgentPart> & Pick<AgentPart, 'id' | 'type'>): AgentPart {
  return {
    id: input.id,
    runId: input.runId ?? 'run-1',
    type: input.type,
    status: input.status ?? 'completed',
    role: input.role,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    input: input.input,
    output: input.output,
    error: input.error,
    metadata: input.metadata,
    orderIndex: input.orderIndex ?? 0,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    createdAt: input.createdAt ?? 1,
    updatedAt: input.updatedAt ?? 1
  }
}

describe('AgentRunState', () => {
  it('converts v1 turn messages into state and restores ledger counts', () => {
    const state = AgentRunState.fromV1Checkpoint({
      turnCount: 3,
      workingHistory: [message('user', 'continue')],
      pendingVerifications: [],
      turnMessages: [
        {
          role: 'assistant',
          content: 'checking',
          tool_calls: [call('old-1', 'pwd', 'first')]
        },
        {
          role: 'tool',
          tool_call_id: 'old-1',
          content: 'result 1'
        },
        {
          role: 'assistant',
          content: 'checking again',
          tool_calls: [call('old-2', 'pwd', 'second')]
        },
        {
          role: 'tool',
          tool_call_id: 'old-2',
          content: 'result 2'
        }
      ]
    })

    expect(state.events.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested',
      'tool_result',
      'assistant_response',
      'tool_call_requested',
      'tool_result'
    ])
    expect(state.snapshot().toolLedger[0].count).toBe(2)
    expect(state.snapshot().toolLedger[0].lastObservation).toBe('result 2')
  })

  it('keeps raw duplicate tool observations in derived model messages', () => {
    const state = new AgentRunState({ workingHistory: [] })
    state.appendAssistantResponse({ turn: 1, content: 'checking', toolCalls: [call('c1', 'pwd', 'one')] })
    state.appendToolResult({
      turn: 1,
      toolCallId: 'c1',
      toolName: 'execute_command',
      signature: 'sig',
      content: 'first full output'
    })
    state.appendAssistantResponse({ turn: 2, content: 'checking', toolCalls: [call('c2', 'pwd', 'two')] })
    state.appendToolResult({
      turn: 2,
      toolCallId: 'c2',
      toolName: 'execute_command',
      signature: 'sig',
      content: 'second full output'
    })

    const messages = state.toModelMessages()
    const firstTool = messages.find(
      (item) => item.role === 'tool' && 'tool_call_id' in item && item.tool_call_id === 'c1'
    )
    const secondTool = messages.find(
      (item) => item.role === 'tool' && 'tool_call_id' in item && item.tool_call_id === 'c2'
    )

    expect(String(firstTool?.content)).toBe('first full output')
    expect(String(secondTool?.content)).toBe('second full output')
  })

  it('keeps terminal final and error events out of derived model context', () => {
    const state = new AgentRunState({ workingHistory: [] })
    state.appendAssistantResponse({ turn: 1, content: 'final answer', toolCalls: [] })
    state.appendFinal(1, 'final answer')
    state.appendError(2, 'network interrupted')

    expect(state.events.map((event) => event.type)).toEqual([
      'assistant_response',
      'final',
      'error'
    ])
    expect(state.toModelMessages()).toEqual([{ role: 'assistant', content: 'final answer', tool_calls: [] }])
  })

  it('keeps duplicate compression only in the explicit summary projection', () => {
    const state = new AgentRunState({ workingHistory: [] })
    state.appendAssistantResponse({ turn: 1, content: 'checking', toolCalls: [call('c1', 'pwd', 'one')] })
    state.appendToolResult({
      turn: 1,
      toolCallId: 'c1',
      toolName: 'execute_command',
      signature: 'sig',
      content: 'first full output'
    })
    state.appendAssistantResponse({ turn: 2, content: 'checking', toolCalls: [call('c2', 'pwd', 'two')] })
    state.appendToolResult({
      turn: 2,
      toolCallId: 'c2',
      toolName: 'execute_command',
      signature: 'sig',
      content: 'second full output'
    })

    const messages = state.toSummaryModelMessages()
    const firstTool = messages.find(
      (item) => item.role === 'tool' && 'tool_call_id' in item && item.tool_call_id === 'c1'
    )

    expect(String(firstTool?.content)).toContain('旧结果已压缩')
  })

  it('round-trips v2 state snapshots', () => {
    const original = new AgentRunState({
      workingHistory: [message('user', 'hello')],
      pendingVerifications: [
        {
          id: 'ver_123',
          hostId: 'h1',
          toolName: 'execute_command',
          command: 'write',
          riskCategory: 'write',
          createdAt: 1
        }
      ]
    })
    original.appendAssistantResponse({ turn: 1, content: 'hi', toolCalls: [] })

    const restored = new AgentRunState(original.snapshot())

    expect(restored.workingHistory[0].content).toBe('hello')
    expect(restored.pendingVerifications[0].id).toBe('ver_123')
    expect(restored.events[0].type).toBe('assistant_response')
  })

  it('rehydrates ledger observations from raw events when a v2 snapshot has no ledger', () => {
    const original = new AgentRunState({ workingHistory: [] })
    original.appendAssistantResponse({
      turn: 1,
      content: 'checking',
      toolCalls: [call('call-1', 'pwd', 'first')]
    })
    original.appendToolResult({
      turn: 1,
      toolCallId: 'call-1',
      toolName: 'execute_command',
      signature: 'sig',
      content: 'raw output',
      observation: 'formatted observation'
    })

    const restored = new AgentRunState({ ...original.snapshot(), toolLedger: [] })

    expect(restored.snapshot().toolLedger[0]).toMatchObject({
      count: 1,
      lastObservation: 'formatted observation',
      lastStatus: 'completed'
    })
  })

  it('keeps the raw event log while deriving model messages after compaction', () => {
    const state = new AgentRunState({ workingHistory: [] })
    state.appendAssistantResponse({ turn: 1, content: 'old response', toolCalls: [] })
    state.setCompactedHistory([message('assistant', 'summary of old response')], 'summary')
    state.appendAssistantResponse({ turn: 2, content: 'new response', toolCalls: [] })

    expect(state.snapshot().events.map((event) => event.type)).toEqual([
      'assistant_response',
      'assistant_response'
    ])
    expect(state.snapshot().compactedEventCount).toBe(1)
    expect(state.toModelMessages().map((item) => String(item.content))).toEqual(['new response'])
    expect(state.toRuntimeMessages('run-1', 'topic-1', 'task-1').map((item) => item.content)).toEqual([
      'summary of old response',
      'new response'
    ])
  })

  it('reconciles persisted tool results when checkpoint lags behind parts', () => {
    const state = new AgentRunState({ workingHistory: [], turnCount: 2 })
    state.appendAssistantResponse({
      turn: 1,
      content: 'checking',
      toolCalls: [call('call-1', 'pwd', 'first')],
      assistantPartId: 'assistant-1'
    })

    const appended = state.reconcileToolResultsFromParts([
      part({
        id: 'tool-1',
        type: 'tool',
        role: 'tool',
        toolName: 'execute_command',
        toolCallId: 'call-1',
        input: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' }),
        output: 'pwd output',
        orderIndex: 2
      })
    ])

    expect(appended).toBe(1)
    expect(state.getPendingAssistantTurn()).toBeUndefined()
    expect(state.toModelMessages().map((item) => item.role)).toEqual(['assistant', 'tool'])
    expect(String(state.toModelMessages()[1].content)).toBe('pwd output')
  })

  it('uses persisted model observation metadata when reconciling tool results', () => {
    const state = new AgentRunState({ workingHistory: [], turnCount: 2 })
    state.appendAssistantResponse({
      turn: 1,
      content: 'checking',
      toolCalls: [call('call-1', 'pwd', 'first')]
    })

    state.reconcileToolResultsFromParts([
      part({
        id: 'tool-1',
        type: 'tool',
        role: 'tool',
        toolName: 'execute_command',
        toolCallId: 'call-1',
        output: '{"content":"raw pwd output","exitCode":0}',
        metadata: { observation: 'Exit 0\nraw pwd output' },
        orderIndex: 2
      })
    ])

    const toolMessage = state.toModelMessages().find((item) => item.role === 'tool')
    expect(String(toolMessage?.content)).toBe('Exit 0\nraw pwd output')
    const toolEvent = state.snapshot().events.find((event) => event.type === 'tool_result')
    expect(toolEvent).toMatchObject({
      content: '{"content":"raw pwd output","exitCode":0}',
      observation: 'Exit 0\nraw pwd output'
    })
  })

  it('hydrates a streamed tool-only assistant turn from persisted parts', () => {
    const state = new AgentRunState({ workingHistory: [], turnCount: 1 })

    const hydrated = state.hydrateLatestAssistantTurnFromParts([
      part({
        id: 'tool-1',
        type: 'tool',
        role: 'tool',
        status: 'pending',
        toolName: 'execute_command',
        toolCallId: 'call-1',
        input: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' }),
        orderIndex: 1
      })
    ])

    expect(hydrated).toBe(2)
    expect(state.getPendingAssistantTurn()?.toolCalls.map((item) => item.id)).toEqual(['call-1'])
    expect(state.toModelMessages()).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [call('call-1', 'pwd', 'first')]
      }
    ])
  })

  it('does not duplicate hydrated assistant events already present in state', () => {
    const state = new AgentRunState({ workingHistory: [], turnCount: 2 })
    state.appendAssistantResponse({
      turn: 1,
      content: '',
      toolCalls: [call('call-1', 'pwd', 'first')]
    })

    const hydrated = state.hydrateLatestAssistantTurnFromParts([
      part({
        id: 'tool-1',
        type: 'tool',
        role: 'tool',
        status: 'pending',
        toolName: 'execute_command',
        toolCallId: 'call-1',
        input: JSON.stringify({ hostId: 'h1', command: 'pwd', reason: 'first' }),
        orderIndex: 1
      })
    ])

    expect(hydrated).toBe(0)
    expect(state.events.map((event) => event.type)).toEqual([
      'assistant_response',
      'tool_call_requested'
    ])
  })
})
