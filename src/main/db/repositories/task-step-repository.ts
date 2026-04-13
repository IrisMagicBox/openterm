import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { TaskStep } from '../../../shared/types'
import { TaskStepRow } from '../row-types'
import { mapTaskStepRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class TaskStepRepository extends BaseRepository<TaskStepRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getTaskSteps(taskId: string): TaskStep[] {
    const rows = this.stmt('SELECT * FROM task_steps WHERE taskId = ? ORDER BY createdAt ASC').all(
      taskId
    ) as TaskStepRow[]
    return rows.map(mapTaskStepRow)
  }

  createStep(
    step: Omit<TaskStep, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<TaskStep, 'id' | 'createdAt' | 'updatedAt'>>
  ): TaskStep {
    const id = step.id || uuidv4()
    const now = step.createdAt || Date.now()
    const updatedAt = step.updatedAt || now
    const createdStep: TaskStep = {
      id,
      taskId: step.taskId,
      type: step.type,
      status: step.status,
      hostId: step.hostId,
      title: step.title,
      content: step.content,
      rawOutput: step.rawOutput,
      metadata: step.metadata,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      createdAt: now,
      updatedAt
    }

    this.stmt(
      `
      INSERT INTO task_steps (id, taskId, type, status, hostId, title, content, rawOutput, metadata, startedAt, endedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdStep.id,
      createdStep.taskId,
      createdStep.type,
      createdStep.status,
      createdStep.hostId || null,
      createdStep.title || null,
      createdStep.content,
      createdStep.rawOutput || null,
      createdStep.metadata ? JSON.stringify(createdStep.metadata) : null,
      createdStep.startedAt || null,
      createdStep.endedAt || null,
      createdStep.createdAt,
      createdStep.updatedAt
    )

    this.stmt('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updatedAt, createdStep.taskId)
    return createdStep
  }

  updateStep(
    id: string,
    updates: Partial<Omit<TaskStep, 'id' | 'taskId' | 'createdAt'>>
  ): TaskStep | undefined {
    const row = this.stmt('SELECT * FROM task_steps WHERE id = ?').get(id) as
      | TaskStepRow
      | undefined
    if (!row) return undefined

    const existing = mapTaskStepRow(row)
    const updated: TaskStep = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    this.stmt(
      `
      UPDATE task_steps
      SET type = ?, status = ?, hostId = ?, title = ?, content = ?, rawOutput = ?, metadata = ?, startedAt = ?, endedAt = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.type,
      updated.status,
      updated.hostId || null,
      updated.title || null,
      updated.content,
      updated.rawOutput || null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.startedAt || null,
      updated.endedAt || null,
      updated.updatedAt,
      id
    )

    this.stmt('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updated.updatedAt, updated.taskId)
    return updated
  }
}
