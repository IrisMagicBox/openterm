import Database from 'better-sqlite3'
import { BaseRepository } from '../base-repository'
import type { AgentRunCheckpointRow } from '../row-types'
import { parseJSON } from '../mappers'

export interface AgentRunCheckpoint {
  runId: string
  payload: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export class AgentRunCheckpointRepository extends BaseRepository<AgentRunCheckpointRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getCheckpoint(runId: string): AgentRunCheckpoint | undefined {
    const row = this.stmt('SELECT * FROM agent_run_checkpoints WHERE runId = ?').get(runId) as
      | AgentRunCheckpointRow
      | undefined
    if (!row) return undefined
    return {
      runId: row.runId,
      payload: parseJSON<Record<string, unknown>>(row.payload, {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  upsertCheckpoint(runId: string, payload: Record<string, unknown>): AgentRunCheckpoint {
    const now = Date.now()
    const existing = this.getCheckpoint(runId)
    const createdAt = existing?.createdAt ?? now

    this.stmt(
      `
      INSERT INTO agent_run_checkpoints (runId, payload, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(runId) DO UPDATE SET
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `
    ).run(runId, JSON.stringify(payload), createdAt, now)

    return {
      runId,
      payload,
      createdAt,
      updatedAt: now
    }
  }

  deleteCheckpoint(runId: string): void {
    this.stmt('DELETE FROM agent_run_checkpoints WHERE runId = ?').run(runId)
  }
}
