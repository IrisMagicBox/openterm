import type { AgentPart, AgentPartStatus } from '../../shared/types'
import { agentRunStore, type AgentRunStore } from './agent-run-store'

export type OpenPartCloseStatus = Extract<AgentPartStatus, 'cancelled' | 'error' | 'completed'>

export interface CloseOpenPartsOptions {
  status?: OpenPartCloseStatus
  reason: string
  endedAt?: number
  metadata?: Record<string, unknown>
}

export class AgentPartWriter {
  constructor(private readonly store: AgentRunStore = agentRunStore) {}

  createPart(
    part: Omit<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'> &
      Partial<Pick<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'>>
  ): AgentPart {
    return this.store.createPart(part)
  }

  updatePart(
    id: string,
    updates: Partial<Omit<AgentPart, 'id' | 'runId' | 'createdAt'>>
  ): AgentPart | undefined {
    return this.store.updatePart(id, updates)
  }

  appendOutput(partId: string, delta: string): AgentPart | undefined {
    return this.appendTextField(partId, 'output', delta)
  }

  appendInput(partId: string, delta: string): AgentPart | undefined {
    return this.appendTextField(partId, 'input', delta)
  }

  createTextPart(input: {
    runId: string
    role?: AgentPart['role']
    output?: string
    status?: AgentPartStatus
    messageId?: string
    metadata?: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    return this.createPart({
      runId: input.runId,
      messageId: input.messageId,
      type: 'text',
      status: input.status ?? 'running',
      role: input.role ?? 'assistant',
      output: input.output,
      metadata: input.metadata,
      startedAt: input.startedAt ?? Date.now(),
      endedAt: input.endedAt
    })
  }

  createToolPart(input: {
    runId: string
    toolName: string
    toolCallId: string
    input?: string
    status?: AgentPartStatus
    metadata?: Record<string, unknown>
    startedAt?: number
  }): AgentPart {
    return this.createPart({
      runId: input.runId,
      type: 'tool',
      status: input.status ?? 'pending',
      role: 'tool',
      toolName: input.toolName,
      toolCallId: input.toolCallId,
      input: input.input,
      metadata: input.metadata,
      startedAt: input.startedAt ?? Date.now()
    })
  }

  createErrorPart(input: {
    runId: string
    error: string
    output?: string
    role?: AgentPart['role']
    messageId?: string
    metadata?: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    const now = Date.now()
    return this.createPart({
      runId: input.runId,
      messageId: input.messageId,
      type: 'error',
      status: 'error',
      role: input.role ?? 'assistant',
      output: input.output,
      error: input.error,
      metadata: input.metadata,
      startedAt: input.startedAt ?? now,
      endedAt: input.endedAt ?? now
    })
  }

  createUsagePart(input: {
    runId: string
    metadata: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    const now = Date.now()
    return this.createPart({
      runId: input.runId,
      type: 'usage',
      status: 'completed',
      metadata: input.metadata,
      startedAt: input.startedAt ?? now,
      endedAt: input.endedAt ?? now
    })
  }

  finishOpenParts(runId: string, options: CloseOpenPartsOptions): AgentPart[] {
    const endedAt = options.endedAt ?? Date.now()
    const status = options.status ?? 'cancelled'
    const openParts = this.store
      .getParts(runId)
      .filter(
        (part) =>
          part.status === 'pending' || part.status === 'running' || part.status === 'blocked'
      )

    const updated: AgentPart[] = []
    for (const part of openParts) {
      const next = this.updatePart(part.id, {
        status,
        error: status === 'completed' ? part.error : (part.error ?? options.reason),
        endedAt,
        metadata: {
          ...(options.metadata ?? {}),
          closeReason: options.reason
        }
      })
      if (next) updated.push(next)
    }
    return updated
  }

  private appendTextField(
    partId: string,
    field: Extract<keyof AgentPart, 'input' | 'output'>,
    delta: string
  ): AgentPart | undefined {
    const part = this.findPart(partId)
    if (!part) return undefined
    return this.updatePart(partId, { [field]: `${part[field] ?? ''}${delta}` })
  }

  private findPart(partId: string): AgentPart | undefined {
    return this.store.getPart(partId)
  }
}

export const agentPartWriter = new AgentPartWriter()
