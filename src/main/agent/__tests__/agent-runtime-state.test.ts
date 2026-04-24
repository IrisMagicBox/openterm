import { describe, expect, it } from 'vitest'
import { mapAgentPartRow, mapAgentRunRow, mapMessageRow } from '../../db/mappers'

describe('agent runtime state mapping', () => {
  it('maps agent run JSON state', () => {
    const run = mapAgentRunRow({
      id: 'run-1',
      topicId: 'topic-1',
      taskId: 'task-1',
      parentRunId: null,
      parentPartId: null,
      agentName: 'build',
      mode: 'primary',
      status: 'running',
      goal: 'do work',
      providerId: null,
      modelId: 'gpt-test',
      usage: '{"totalTokens":123}',
      metadata: '{"latestContextReport":{"turnCount":1}}',
      error: null,
      createdAt: 1,
      updatedAt: 2,
      completedAt: null
    })

    expect(run.status).toBe('running')
    expect(run.usage?.totalTokens).toBe(123)
    expect((run.metadata?.latestContextReport as { turnCount?: number })?.turnCount).toBe(1)
    expect(run.modelId).toBe('gpt-test')
  })

  it('maps agent part lifecycle fields', () => {
    const part = mapAgentPartRow({
      id: 'part-1',
      runId: 'run-1',
      messageId: null,
      parentPartId: null,
      type: 'tool',
      status: 'completed',
      role: 'tool',
      toolName: 'execute_command',
      toolCallId: 'call-1',
      hostId: 'host-1',
      sessionId: 'session-1',
      input: '{"command":"pwd"}',
      output: '{"exitCode":0}',
      error: null,
      metadata: '{"durationMs":12}',
      orderIndex: 0,
      startedAt: 10,
      endedAt: 22,
      createdAt: 10,
      updatedAt: 22
    })

    expect(part.type).toBe('tool')
    expect(part.status).toBe('completed')
    expect(part.metadata?.durationMs).toBe(12)
  })

  it('maps message run metadata', () => {
    const message = mapMessageRow({
      id: 'msg-1',
      topicId: 'topic-1',
      runId: 'run-1',
      role: 'assistant',
      content: 'done',
      thought: null,
      toolCalls: null,
      toolCallId: null,
      name: null,
      metadata: '{"taskId":"task-1"}',
      timestamp: 1
    })

    expect(message.runId).toBe('run-1')
    expect(message.metadata?.taskId).toBe('task-1')
  })
})
