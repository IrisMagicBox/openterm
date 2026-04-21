import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { AgentRun } from '../../../shared/types'
import { AgentRunRow } from '../row-types'
import { mapAgentRunRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class AgentRunRepository extends BaseRepository<AgentRunRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getRun(id: string): AgentRun | undefined {
    const row = this.stmt('SELECT * FROM agent_runs WHERE id = ?').get(id) as
      | AgentRunRow
      | undefined
    return row ? mapAgentRunRow(row) : undefined
  }

  getRunsByTask(taskId: string): AgentRun[] {
    const rows = this.stmt('SELECT * FROM agent_runs WHERE taskId = ? ORDER BY createdAt ASC').all(
      taskId
    ) as AgentRunRow[]
    return rows.map(mapAgentRunRow)
  }

  getChildRuns(parentRunId: string): AgentRun[] {
    const rows = this.stmt(
      'SELECT * FROM agent_runs WHERE parentRunId = ? ORDER BY createdAt ASC'
    ).all(parentRunId) as AgentRunRow[]
    return rows.map(mapAgentRunRow)
  }

  createRun(
    run: Omit<AgentRun, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<AgentRun, 'id' | 'createdAt' | 'updatedAt'>>
  ): AgentRun {
    const now = Date.now()
    const created: AgentRun = {
      id: run.id ?? uuidv4(),
      topicId: run.topicId,
      taskId: run.taskId,
      parentRunId: run.parentRunId,
      parentPartId: run.parentPartId,
      agentName: run.agentName,
      mode: run.mode,
      status: run.status,
      goal: run.goal,
      providerId: run.providerId,
      modelId: run.modelId,
      usage: run.usage,
      error: run.error,
      createdAt: run.createdAt ?? now,
      updatedAt: run.updatedAt ?? now,
      completedAt: run.completedAt
    }

    this.stmt(
      `
      INSERT INTO agent_runs (
        id, topicId, taskId, parentRunId, parentPartId, agentName, mode, status, goal,
        providerId, modelId, usage, error, createdAt, updatedAt, completedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      created.id,
      created.topicId,
      created.taskId,
      created.parentRunId ?? null,
      created.parentPartId ?? null,
      created.agentName,
      created.mode,
      created.status,
      created.goal,
      created.providerId ?? null,
      created.modelId ?? null,
      created.usage ? JSON.stringify(created.usage) : null,
      created.error ?? null,
      created.createdAt,
      created.updatedAt,
      created.completedAt ?? null
    )

    return created
  }

  updateRun(
    id: string,
    updates: Partial<Omit<AgentRun, 'id' | 'topicId' | 'taskId' | 'createdAt'>>
  ): AgentRun | undefined {
    const existing = this.getRun(id)
    if (!existing) return undefined

    const updated: AgentRun = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    this.stmt(
      `
      UPDATE agent_runs
      SET parentRunId = ?, parentPartId = ?, agentName = ?, mode = ?, status = ?, goal = ?,
          providerId = ?, modelId = ?, usage = ?, error = ?, updatedAt = ?, completedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.parentRunId ?? null,
      updated.parentPartId ?? null,
      updated.agentName,
      updated.mode,
      updated.status,
      updated.goal,
      updated.providerId ?? null,
      updated.modelId ?? null,
      updated.usage ? JSON.stringify(updated.usage) : null,
      updated.error ?? null,
      updated.updatedAt,
      updated.completedAt ?? null,
      id
    )

    return updated
  }

  cancelRunTree(id: string, reason = 'Run cancelled'): void {
    const now = Date.now()
    const cancelOne = (runId: string) => {
      const children = this.getChildRuns(runId)
      for (const child of children) cancelOne(child.id)

      this.stmt(
        `
        UPDATE agent_parts
        SET status = 'cancelled',
            error = COALESCE(error, ?),
            endedAt = COALESCE(endedAt, ?),
            updatedAt = ?
        WHERE runId = ? AND status IN ('pending', 'running', 'blocked')
      `
      ).run(reason, now, now, runId)

      this.stmt(
        `
        UPDATE agent_runs
        SET status = 'cancelled',
            error = COALESCE(error, ?),
            completedAt = COALESCE(completedAt, ?),
            updatedAt = ?
        WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')
      `
      ).run(reason, now, now, runId)
    }

    this.db.transaction(cancelOne)(id)
  }
}
