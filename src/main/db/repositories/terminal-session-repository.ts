import Database from 'better-sqlite3'
import {
  TerminalSession,
  TerminalSessionDeletedBy,
  TerminalSessionStatus
} from '../../../shared/types'
import { TerminalSessionRow } from '../row-types'
import { mapTerminalSessionRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class TerminalSessionRepository extends BaseRepository<TerminalSessionRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  createSession(session: TerminalSession): void {
    this.stmt(
      `INSERT INTO terminal_sessions (id, topicId, hostId, hostAlias, role, visible, status, shellType, shellIntegrationReady, isPinned, createdAt, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` +
        ` ON CONFLICT(id) DO UPDATE SET
            topicId = excluded.topicId,
            hostId = excluded.hostId,
            hostAlias = excluded.hostAlias,
            role = excluded.role,
            visible = COALESCE(excluded.visible, terminal_sessions.visible, CASE WHEN excluded.role = 'agent_command' THEN 0 ELSE 1 END),
            status = excluded.status,
            shellType = COALESCE(excluded.shellType, terminal_sessions.shellType),
            shellIntegrationReady = excluded.shellIntegrationReady,
            isPinned = COALESCE(excluded.isPinned, terminal_sessions.isPinned, 0),
            closedAt = NULL,
            name = COALESCE(excluded.name, terminal_sessions.name),
            isDeleted = 0,
            deletedAt = NULL,
            deletedBy = NULL`
    ).run(
      session.id,
      session.topicId,
      session.hostId,
      session.hostAlias,
      session.role || 'user',
      session.visible == null ? null : session.visible ? 1 : 0,
      session.status,
      session.shellType || null,
      session.shellIntegrationReady ? 1 : 0,
      session.isPinned == null ? null : session.isPinned ? 1 : 0,
      session.createdAt,
      session.name || null
    )
  }

  getSessionById(id: string): TerminalSession | undefined {
    const row = this.stmt('SELECT * FROM terminal_sessions WHERE id = ?').get(id) as
      | TerminalSessionRow
      | undefined
    if (!row) return undefined
    return mapTerminalSessionRow(row)
  }

  getSessionsByTopic(topicId: string, includeDeleted = false): TerminalSession[] {
    let query = 'SELECT * FROM terminal_sessions WHERE topicId = ?'
    if (!includeDeleted) {
      query += ' AND isDeleted = 0'
    }
    query += ' ORDER BY createdAt DESC'
    const rows = this.stmt(query).all(topicId) as TerminalSessionRow[]
    return rows.map(mapTerminalSessionRow)
  }

  getActiveSessionsByTopic(topicId: string): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE topicId = ? AND status = ? AND isDeleted = 0 ORDER BY createdAt DESC'
    ).all(topicId, 'active') as TerminalSessionRow[]
    return rows.map(mapTerminalSessionRow)
  }

  getDeletedSessionsByTopic(topicId: string): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE topicId = ? AND isDeleted = 1 ORDER BY deletedAt DESC'
    ).all(topicId) as TerminalSessionRow[]
    return rows.map(mapTerminalSessionRow)
  }

  getSessionsByHost(hostId: string): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE hostId = ? ORDER BY createdAt DESC'
    ).all(hostId) as TerminalSessionRow[]
    return rows.map(mapTerminalSessionRow)
  }

  updateSessionStatus(id: string, status: TerminalSessionStatus): void {
    this.stmt('UPDATE terminal_sessions SET status = ? WHERE id = ?').run(status, id)
  }

  updateSessionShellIntegration(id: string, ready: boolean): void {
    this.stmt('UPDATE terminal_sessions SET shellIntegrationReady = ? WHERE id = ?').run(
      ready ? 1 : 0,
      id
    )
  }

  updateSessionName(id: string, name: string): void {
    this.stmt('UPDATE terminal_sessions SET name = ? WHERE id = ?').run(name, id)
  }

  updateSessionVisibility(id: string, visible: boolean): void {
    this.stmt('UPDATE terminal_sessions SET visible = ? WHERE id = ?').run(visible ? 1 : 0, id)
  }

  updateSessionPinned(id: string, isPinned: boolean): void {
    this.stmt('UPDATE terminal_sessions SET isPinned = ? WHERE id = ?').run(isPinned ? 1 : 0, id)
  }

  closeSession(id: string, deletedBy: TerminalSessionDeletedBy = 'agent'): void {
    const now = Date.now()
    this.stmt(
      'UPDATE terminal_sessions SET status = ?, closedAt = ?, isDeleted = 1, deletedAt = ?, deletedBy = ? WHERE id = ?'
    ).run('closed', now, now, deletedBy, id)
  }

  softDeleteSession(id: string, deletedBy: 'user' | 'agent' | 'system'): void {
    this.stmt(
      'UPDATE terminal_sessions SET isDeleted = 1, deletedAt = ?, deletedBy = ? WHERE id = ?'
    ).run(Date.now(), deletedBy, id)
  }

  restoreSession(id: string): void {
    this.stmt(
      'UPDATE terminal_sessions SET isDeleted = 0, deletedAt = NULL, deletedBy = NULL WHERE id = ?'
    ).run(id)
  }

  hardDeleteSession(id: string): void {
    this.stmt('DELETE FROM terminal_sessions WHERE id = ?').run(id)
  }

  getActiveSessions(): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE status = ? AND isDeleted = 0 ORDER BY createdAt DESC'
    ).all('active') as TerminalSessionRow[]
    return rows.map(mapTerminalSessionRow)
  }

  markAllSessionsClosed(): void {
    this.stmt('UPDATE terminal_sessions SET status = ?, closedAt = ? WHERE status = ?').run(
      'closed',
      Date.now(),
      'active'
    )
  }

  updateAgentNotes(id: string, notes: string): void {
    this.stmt('UPDATE terminal_sessions SET agentNotes = ? WHERE id = ?').run(notes, id)
  }
}
