import { describe, expect, it, vi } from 'vitest'
import type { AgentPart } from '../../../shared/types'
import type { AgentRunStore } from '../agent-run-store'

vi.mock('../agent-run-store', () => ({
  agentRunStore: {}
}))

import { AgentPartProjection } from '../agent-part-projection'
import { AgentPartWriter } from '../agent-part-writer'

type CreatePartInput = Parameters<AgentRunStore['createPart']>[0]
type UpdatePartInput = Parameters<AgentRunStore['updatePart']>[1]

function createMemoryStore(): { store: AgentRunStore; parts: Map<string, AgentPart> } {
  const parts = new Map<string, AgentPart>()
  let orderIndex = 0

  const store = {
    createPart(input: CreatePartInput) {
      const now = Date.now()
      const part: AgentPart = {
        id: input.id ?? `part-${parts.size + 1}`,
        runId: input.runId,
        messageId: input.messageId,
        parentPartId: input.parentPartId,
        type: input.type,
        status: input.status,
        role: input.role,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        hostId: input.hostId,
        sessionId: input.sessionId,
        input: input.input,
        output: input.output,
        error: input.error,
        metadata: input.metadata,
        orderIndex: input.orderIndex ?? orderIndex++,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now
      }
      parts.set(part.id, part)
      return part
    },
    updatePart(id: string, updates: UpdatePartInput) {
      const existing = parts.get(id)
      if (!existing) return undefined
      const updated: AgentPart = {
        ...existing,
        ...updates,
        metadata:
          updates.metadata === undefined
            ? existing.metadata
            : { ...(existing.metadata ?? {}), ...updates.metadata },
        updatedAt: Date.now()
      }
      parts.set(id, updated)
      return updated
    },
    getPart(id: string) {
      return parts.get(id)
    },
    getParts(runId: string) {
      return Array.from(parts.values()).filter((part) => part.runId === runId)
    }
  } satisfies Partial<AgentRunStore>

  return { store: store as AgentRunStore, parts }
}

function createProjection(store: AgentRunStore): AgentPartProjection {
  return new AgentPartProjection(new AgentPartWriter(store))
}

describe('AgentPartProjection', () => {
  it('records user and assistant message parts with semantic roles', () => {
    const { store } = createMemoryStore()
    const projection = createProjection(store)

    const userPart = projection.createUserMessagePart({
      runId: 'run-1',
      messageId: 'msg-user',
      content: 'hello',
      timestamp: 10
    })
    const assistantPart = projection.createAssistantTextPart({
      runId: 'run-1',
      messageId: 'msg-assistant',
      output: 'hi',
      status: 'completed',
      startedAt: 11,
      endedAt: 12
    })

    expect(userPart).toMatchObject({
      type: 'text',
      role: 'user',
      status: 'completed',
      output: 'hello',
      startedAt: 10,
      endedAt: 10
    })
    expect(assistantPart).toMatchObject({
      type: 'text',
      role: 'assistant',
      status: 'completed',
      output: 'hi'
    })
  })

  it('preserves metadata merge semantics for tool lifecycle updates', () => {
    const { store } = createMemoryStore()
    const projection = createProjection(store)
    const part = projection.createToolCallPart({
      runId: 'run-1',
      toolName: 'execute_command',
      toolCallId: 'call-1',
      metadata: { first: true }
    })

    projection.startToolCallPart(part.id, {
      rawArguments: '{"command":"pwd"}',
      legacyStepId: 'step-1',
      startedAt: 20
    })
    const completed = projection.completeToolCallPart(part.id, {
      output: 'ok',
      metadata: { second: true },
      endedAt: 30
    })

    expect(completed).toMatchObject({
      status: 'completed',
      input: '{"command":"pwd"}',
      output: 'ok',
      metadata: { first: true, legacyStepId: 'step-1', second: true }
    })
  })

  it('creates child parts under the current tool part', () => {
    const { store } = createMemoryStore()
    const projection = createProjection(store)

    const child = projection.createChildPart('run-1', 'parent-part', {
      type: 'step',
      status: 'running',
      input: 'child work'
    })

    expect(child).toMatchObject({
      runId: 'run-1',
      parentPartId: 'parent-part',
      type: 'step',
      status: 'running',
      input: 'child work'
    })
  })
})
