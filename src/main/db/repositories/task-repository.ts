import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Task } from '../../../shared/types'
import { TaskRow } from '../row-types'
import { mapTaskRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class TaskRepository extends BaseRepository<TaskRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getTasks(topicId?: string): Task[] {
    const query = topicId
      ? 'SELECT * FROM tasks WHERE topicId = ? ORDER BY updatedAt DESC'
      : 'SELECT * FROM tasks ORDER BY updatedAt DESC'
    const rows = this.stmt(query).all(topicId ? topicId : undefined) as TaskRow[]
    return rows.map(mapTaskRow)
  }

  getTaskById(id: string): Task | undefined {
    const row = this.stmt('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    return row ? mapTaskRow(row) : undefined
  }

  getLatestTaskByTopicId(topicId: string): Task | undefined {
    const row = this.stmt(
      'SELECT * FROM tasks WHERE topicId = ? ORDER BY updatedAt DESC LIMIT 1'
    ).get(topicId) as TaskRow | undefined
    return row ? mapTaskRow(row) : undefined
  }

  createTask(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ): Task {
    const id = task.id || uuidv4()
    const now = task.createdAt || Date.now()
    const updatedAt = task.updatedAt || now
    const createdTask: Task = {
      id,
      topicId: task.topicId,
      title: task.title,
      goal: task.goal,
      status: task.status,
      summary: task.summary,
      selectedProviderId: task.selectedProviderId,
      selectedModelId: task.selectedModelId,
      createdAt: now,
      updatedAt
    }

    this.stmt(
      `
      INSERT INTO tasks (id, topicId, title, goal, status, summary, selectedProviderId, selectedModelId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdTask.id,
      createdTask.topicId,
      createdTask.title,
      createdTask.goal,
      createdTask.status,
      createdTask.summary || null,
      createdTask.selectedProviderId || null,
      createdTask.selectedModelId || null,
      createdTask.createdAt,
      createdTask.updatedAt
    )

    return createdTask
  }

  updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'topicId' | 'createdAt'>>
  ): Task | undefined {
    const existing = this.getTaskById(id)
    if (!existing) return undefined

    const updated: Task = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    this.stmt(
      `
      UPDATE tasks
      SET title = ?, goal = ?, status = ?, summary = ?, selectedProviderId = ?, selectedModelId = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.title,
      updated.goal,
      updated.status,
      updated.summary || null,
      updated.selectedProviderId || null,
      updated.selectedModelId || null,
      updated.updatedAt,
      id
    )

    return updated
  }
}
