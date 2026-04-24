import { describe, expect, it, vi } from 'vitest'
import type { AgentPart } from '../../../shared/types'
import type { AgentRunStore } from '../agent-run-store'

vi.mock('../agent-run-store', () => ({
  agentRunStore: {}
}))

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

describe('AgentPartWriter', () => {
  it('creates parts through the runtime write boundary', () => {
    const { store } = createMemoryStore()
    const writer = new AgentPartWriter(store)

    const part = writer.createTextPart({
      runId: 'run-1',
      output: 'hello'
    })

    expect(part.type).toBe('text')
    expect(part.status).toBe('running')
    expect(part.output).toBe('hello')
    expect(part.orderIndex).toBe(0)
  })

  it('appends output deltas without replacing existing output', () => {
    const { store } = createMemoryStore()
    const writer = new AgentPartWriter(store)
    const part = writer.createTextPart({ runId: 'run-1', output: 'hel' })

    const updated = writer.appendOutput(part.id, 'lo')

    expect(updated?.output).toBe('hello')
  })

  it('merges metadata updates', () => {
    const { store } = createMemoryStore()
    const writer = new AgentPartWriter(store)
    const part = writer.createToolPart({
      runId: 'run-1',
      toolName: 'execute_command',
      toolCallId: 'call-1',
      metadata: { first: true }
    })

    const updated = writer.updatePart(part.id, { metadata: { second: true } })

    expect(updated?.metadata).toEqual({ first: true, second: true })
  })

  it('closes all open parts for a run', () => {
    const { store } = createMemoryStore()
    const writer = new AgentPartWriter(store)
    writer.createToolPart({ runId: 'run-1', toolName: 'a', toolCallId: 'a' })
    writer.createTextPart({ runId: 'run-1', output: 'thinking' })
    writer.createTextPart({
      runId: 'run-1',
      output: 'done',
      status: 'completed',
      endedAt: 1
    })
    writer.createToolPart({ runId: 'run-2', toolName: 'b', toolCallId: 'b' })

    const closed = writer.finishOpenParts('run-1', {
      status: 'cancelled',
      reason: 'User cancelled'
    })

    expect(closed).toHaveLength(2)
    expect(store.getParts('run-1').map((part) => part.status)).toEqual([
      'cancelled',
      'cancelled',
      'completed'
    ])
    expect(store.getParts('run-2')[0].status).toBe('pending')
  })
})
