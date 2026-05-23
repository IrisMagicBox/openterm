import type { AgentPart, AgentPartStatus, ApprovalRiskLevel } from '../../shared/types'
import { AgentPartWriter, type CloseOpenPartsOptions } from './agent-part-writer'

type PartUpdate = Partial<Omit<AgentPart, 'id' | 'runId' | 'createdAt'>>

export interface ToolPartInput {
  runId: string
  toolName: string
  toolCallId: string
  input?: string
  status?: AgentPartStatus
  metadata?: Record<string, unknown>
  startedAt?: number
}

export class AgentPartProjection {
  constructor(private readonly writer = new AgentPartWriter()) {}

  createUserMessagePart(input: {
    runId: string
    messageId: string
    content: string
    timestamp: number
  }): AgentPart {
    return this.writer.createTextPart({
      runId: input.runId,
      messageId: input.messageId,
      role: 'user',
      status: 'completed',
      output: input.content,
      startedAt: input.timestamp,
      endedAt: input.timestamp
    })
  }

  createAssistantTextPart(input: {
    runId: string
    output?: string
    status?: AgentPartStatus
    messageId?: string
    metadata?: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    return this.writer.createTextPart({
      ...input,
      role: 'assistant'
    })
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
    return this.writer.createTextPart(input)
  }

  createAssistantErrorPart(input: {
    runId: string
    error: string
    output?: string
    messageId?: string
    metadata?: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    return this.writer.createErrorPart({
      ...input,
      role: 'assistant'
    })
  }

  updateAssistantTextPart(partId: string, updates: PartUpdate): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      ...updates,
      role: updates.role ?? 'assistant'
    })
  }

  createToolCallPart(input: ToolPartInput): AgentPart {
    return this.writer.createToolPart(input)
  }

  updateToolCallPart(partId: string, updates: PartUpdate): AgentPart | undefined {
    return this.writer.updatePart(partId, updates)
  }

  startToolCallPart(
    partId: string,
    input: { rawArguments: string; legacyStepId: string; startedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'running',
      input: input.rawArguments,
      startedAt: input.startedAt ?? Date.now(),
      metadata: { legacyStepId: input.legacyStepId }
    })
  }

  completeToolCallPart(
    partId: string,
    input: { output: string; metadata?: Record<string, unknown>; endedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'completed',
      output: input.output,
      endedAt: input.endedAt ?? Date.now(),
      metadata: input.metadata
    })
  }

  failToolCallPart(
    partId: string,
    input: { error: string; metadata?: Record<string, unknown>; endedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'error',
      error: input.error,
      endedAt: input.endedAt ?? Date.now(),
      metadata: input.metadata
    })
  }

  annotateToolObservation(partId: string, observation: string): AgentPart | undefined {
    return this.writer.updatePart(partId, { metadata: { observation } })
  }

  recordUsage(input: {
    runId: string
    metadata: Record<string, unknown>
    startedAt?: number
    endedAt?: number
  }): AgentPart {
    return this.writer.createUsagePart(input)
  }

  createCompactionPart(input: {
    runId: string
    input: string
    metadata?: Record<string, unknown>
    startedAt?: number
  }): AgentPart {
    return this.writer.createPart({
      runId: input.runId,
      type: 'compaction',
      status: 'running',
      input: input.input,
      metadata: input.metadata,
      startedAt: input.startedAt ?? Date.now()
    })
  }

  completeCompactionPart(
    partId: string,
    input: { output: string; metadata?: Record<string, unknown>; endedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'completed',
      output: input.output,
      endedAt: input.endedAt ?? Date.now(),
      metadata: input.metadata
    })
  }

  failCompactionPart(
    partId: string,
    input: { error: string; metadata?: Record<string, unknown>; endedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'error',
      error: input.error,
      endedAt: input.endedAt ?? Date.now(),
      metadata: input.metadata
    })
  }

  createPermissionPart(input: {
    runId: string
    parentPartId?: string
    pattern: string
    permission: string
    riskLevel: ApprovalRiskLevel
    reason?: string
    metadata?: Record<string, unknown>
    startedAt?: number
  }): AgentPart {
    return this.writer.createPart({
      runId: input.runId,
      parentPartId: input.parentPartId,
      type: 'permission',
      status: 'blocked',
      input: input.pattern,
      metadata: {
        permission: input.permission,
        riskLevel: input.riskLevel,
        reason: input.reason,
        ...(input.metadata ?? {})
      },
      startedAt: input.startedAt ?? Date.now()
    })
  }

  completePermissionPart(
    partId: string,
    input: {
      output: string
      approved: true
      alwaysAllow: boolean
      metadata?: Record<string, unknown>
      endedAt?: number
    }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'completed',
      output: input.output,
      endedAt: input.endedAt ?? Date.now(),
      metadata: {
        approved: input.approved,
        alwaysAllow: input.alwaysAllow,
        ...(input.metadata ?? {})
      }
    })
  }

  failPermissionPart(
    partId: string,
    input: { error: string; metadata?: Record<string, unknown>; endedAt?: number }
  ): AgentPart | undefined {
    return this.writer.updatePart(partId, {
      status: 'error',
      error: input.error,
      endedAt: input.endedAt ?? Date.now(),
      metadata: input.metadata
    })
  }

  updatePart(partId: string, updates: PartUpdate): AgentPart | undefined {
    return this.writer.updatePart(partId, updates)
  }

  appendPartMetadata(partId: string, metadata: Record<string, unknown>): AgentPart | undefined {
    return this.writer.updatePart(partId, { metadata })
  }

  createChildPart(
    runId: string,
    parentPartId: string,
    input: Omit<
      AgentPart,
      'id' | 'runId' | 'parentPartId' | 'createdAt' | 'updatedAt' | 'orderIndex'
    > &
      Partial<Pick<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'>>
  ): AgentPart {
    return this.writer.createPart({
      runId,
      parentPartId,
      ...input
    })
  }

  closeOpenParts(runId: string, options: CloseOpenPartsOptions): AgentPart[] {
    return this.writer.finishOpenParts(runId, options)
  }
}
