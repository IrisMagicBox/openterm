import Database from 'better-sqlite3'
import { TerminalIO } from '../../../shared/types'
import { TerminalIORow } from '../row-types'
import { mapTerminalIORow } from '../mappers'
import { BaseRepository } from '../base-repository'
import {
  TERMINAL_IO_SESSION_LIMIT,
  TERMINAL_IO_TOPIC_LIMIT,
  RECENT_INPUTS_LIMIT
} from '../../constants'

export class TerminalIORepository extends BaseRepository<TerminalIORow> {
  constructor(db: Database.Database) {
    super(db)
  }

  createIO(io: TerminalIO): void {
    this.stmt(
      `INSERT INTO terminal_io (id, sessionId, topicId, hostId, type, source, content, exitCode, durationMs, relatedInputId, isStreaming, chunkIndex, isTruncated, cwd, taskId, stepId, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      io.id,
      io.sessionId,
      io.topicId,
      io.hostId,
      io.type,
      io.source,
      io.content,
      io.exitCode || null,
      io.durationMs || null,
      io.relatedInputId || null,
      io.isStreaming ? 1 : 0,
      io.chunkIndex || 0,
      io.isTruncated ? 1 : 0,
      io.cwd || null,
      io.taskId || null,
      io.stepId || null,
      io.timestamp
    )
  }

  getIOById(id: string): TerminalIO | undefined {
    const row = this.stmt('SELECT * FROM terminal_io WHERE id = ?').get(id) as
      | TerminalIORow
      | undefined
    return row ? mapTerminalIORow(row) : undefined
  }

  getIOBySession(sessionId: string, limit = TERMINAL_IO_SESSION_LIMIT): TerminalIO[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_io WHERE sessionId = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(sessionId, limit) as TerminalIORow[]
    return rows.map(mapTerminalIORow).reverse()
  }

  getIOByTopic(topicId: string, limit = TERMINAL_IO_TOPIC_LIMIT): TerminalIO[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_io WHERE topicId = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(topicId, limit) as TerminalIORow[]
    return rows.map(mapTerminalIORow).reverse()
  }

  getRecentInputsBySession(sessionId: string, limit = RECENT_INPUTS_LIMIT): TerminalIO[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_io WHERE sessionId = ? AND type = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(sessionId, 'input', limit) as TerminalIORow[]
    return rows.map(mapTerminalIORow).reverse()
  }

  getOutputByRelatedInput(relatedInputId: string): TerminalIO | undefined {
    const row = this.stmt('SELECT * FROM terminal_io WHERE relatedInputId = ? AND type = ?').get(
      relatedInputId,
      'output'
    ) as TerminalIORow | undefined
    return row ? mapTerminalIORow(row) : undefined
  }

  updateOutput(id: string, updates: Partial<TerminalIO>): void {
    const sets: string[] = []
    const values: unknown[] = []
    if (updates.content !== undefined) {
      sets.push('content = ?')
      values.push(updates.content)
    }
    if (updates.exitCode !== undefined) {
      sets.push('exitCode = ?')
      values.push(updates.exitCode)
    }
    if (updates.durationMs !== undefined) {
      sets.push('durationMs = ?')
      values.push(updates.durationMs)
    }
    if (updates.isTruncated !== undefined) {
      sets.push('isTruncated = ?')
      values.push(updates.isTruncated ? 1 : 0)
    }
    if (updates.chunkIndex !== undefined) {
      sets.push('chunkIndex = ?')
      values.push(updates.chunkIndex)
    }
    if (sets.length > 0) {
      this.db.prepare(`UPDATE terminal_io SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }
  }

  deleteIOBySession(sessionId: string): void {
    this.stmt('DELETE FROM terminal_io WHERE sessionId = ?').run(sessionId)
  }

  searchCommandInputs(query: string, limit = 20): any[] {
    return this.stmt(
      `SELECT DISTINCT content, source, hostId, timestamp FROM terminal_io
       WHERE type = 'input' AND content LIKE ?
       ORDER BY timestamp DESC LIMIT ?`
    ).all(`%${query}%`, limit)
  }
}
