import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { AgentPart } from '../../../shared/types'
import { AgentPartRow } from '../row-types'
import { mapAgentPartRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class AgentPartRepository extends BaseRepository<AgentPartRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getPart(id: string): AgentPart | undefined {
    const row = this.stmt('SELECT * FROM agent_parts WHERE id = ?').get(id) as
      | AgentPartRow
      | undefined
    return row ? mapAgentPartRow(row) : undefined
  }

  getPartsByRun(runId: string): AgentPart[] {
    const rows = this.stmt(
      'SELECT * FROM agent_parts WHERE runId = ? ORDER BY orderIndex ASC, createdAt ASC'
    ).all(runId) as AgentPartRow[]
    return rows.map(mapAgentPartRow)
  }

  getPartsByTask(taskId: string): AgentPart[] {
    const rows = this.stmt(
      `
      SELECT p.*
      FROM agent_parts p
      JOIN agent_runs r ON r.id = p.runId
      WHERE r.taskId = ?
      ORDER BY r.createdAt ASC, p.orderIndex ASC, p.createdAt ASC
    `
    ).all(taskId) as AgentPartRow[]
    return rows.map(mapAgentPartRow)
  }

  getPartByToolCall(runId: string, toolCallId: string): AgentPart | undefined {
    const row = this.stmt('SELECT * FROM agent_parts WHERE runId = ? AND toolCallId = ?').get(
      runId,
      toolCallId
    ) as AgentPartRow | undefined
    return row ? mapAgentPartRow(row) : undefined
  }

  nextOrderIndex(runId: string): number {
    const row = this.stmt(
      'SELECT COALESCE(MAX(orderIndex), -1) + 1 AS nextOrder FROM agent_parts WHERE runId = ?'
    ).get(runId) as { nextOrder: number }
    return row.nextOrder
  }

  createPart(
    part: Omit<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'> &
      Partial<Pick<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'>>
  ): AgentPart {
    const now = Date.now()
    const created: AgentPart = {
      id: part.id ?? uuidv4(),
      runId: part.runId,
      messageId: part.messageId,
      parentPartId: part.parentPartId,
      type: part.type,
      status: part.status,
      role: part.role,
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      hostId: part.hostId,
      sessionId: part.sessionId,
      input: part.input,
      output: part.output,
      error: part.error,
      metadata: part.metadata,
      orderIndex: part.orderIndex ?? this.nextOrderIndex(part.runId),
      startedAt: part.startedAt,
      endedAt: part.endedAt,
      createdAt: part.createdAt ?? now,
      updatedAt: part.updatedAt ?? now
    }

    this.stmt(
      `
      INSERT INTO agent_parts (
        id, runId, messageId, parentPartId, type, status, role, toolName, toolCallId, hostId,
        sessionId, input, output, error, metadata, orderIndex, startedAt, endedAt, createdAt,
        updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      created.id,
      created.runId,
      created.messageId ?? null,
      created.parentPartId ?? null,
      created.type,
      created.status,
      created.role ?? null,
      created.toolName ?? null,
      created.toolCallId ?? null,
      created.hostId ?? null,
      created.sessionId ?? null,
      created.input ?? null,
      created.output ?? null,
      created.error ?? null,
      created.metadata ? JSON.stringify(created.metadata) : null,
      created.orderIndex,
      created.startedAt ?? null,
      created.endedAt ?? null,
      created.createdAt,
      created.updatedAt
    )

    return created
  }

  updatePart(
    id: string,
    updates: Partial<Omit<AgentPart, 'id' | 'runId' | 'createdAt'>>
  ): AgentPart | undefined {
    const existing = this.getPart(id)
    if (!existing) return undefined

    const updated: AgentPart = {
      ...existing,
      ...updates,
      metadata:
        updates.metadata === undefined
          ? existing.metadata
          : {
              ...(existing.metadata ?? {}),
              ...updates.metadata
            },
      updatedAt: Date.now()
    }

    this.stmt(
      `
      UPDATE agent_parts
      SET messageId = ?, parentPartId = ?, type = ?, status = ?, role = ?, toolName = ?,
          toolCallId = ?, hostId = ?, sessionId = ?, input = ?, output = ?, error = ?,
          metadata = ?, orderIndex = ?, startedAt = ?, endedAt = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.messageId ?? null,
      updated.parentPartId ?? null,
      updated.type,
      updated.status,
      updated.role ?? null,
      updated.toolName ?? null,
      updated.toolCallId ?? null,
      updated.hostId ?? null,
      updated.sessionId ?? null,
      updated.input ?? null,
      updated.output ?? null,
      updated.error ?? null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.orderIndex,
      updated.startedAt ?? null,
      updated.endedAt ?? null,
      updated.updatedAt,
      id
    )

    return updated
  }
}
