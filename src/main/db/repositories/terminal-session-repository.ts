import Database from 'better-sqlite3'
import { TerminalSession, TerminalSessionStatus } from '../../../shared/types'
import { TerminalSessionRow } from '../row-types'
import { mapTerminalSessionRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class TerminalSessionRepository extends BaseRepository<TerminalSessionRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  createSession(session: TerminalSession): void {
    this.stmt(
      `INSERT INTO terminal_sessions (id, topicId, hostId, hostAlias, status, shellType, shellIntegrationReady, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.topicId,
      session.hostId,
      session.hostAlias,
      session.status,
      session.shellType || null,
      session.shellIntegrationReady ? 1 : 0,
      session.createdAt
    )
  }

  getSessionById(id: string): TerminalSession | undefined {
    const row = this.stmt('SELECT * FROM terminal_sessions WHERE id = ?').get(id) as
      | TerminalSessionRow
      | undefined
    if (!row) return undefined
    return {
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status as TerminalSessionStatus,
      shellType: row.shellType ?? undefined,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt ?? undefined
    }
  }

  getSessionsByTopic(topicId: string): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE topicId = ? AND status = ? ORDER BY createdAt DESC'
    ).all(topicId, 'active') as TerminalSessionRow[]
    return rows.map((row) => ({
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status as TerminalSessionStatus,
      shellType: row.shellType ?? undefined,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt ?? undefined
    }))
  }

  getSessionsByHost(hostId: string): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE hostId = ? ORDER BY createdAt DESC'
    ).all(hostId) as TerminalSessionRow[]
    return rows.map((row) => ({
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status as TerminalSessionStatus,
      shellType: row.shellType ?? undefined,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt ?? undefined
    }))
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

  closeSession(id: string): void {
    this.stmt('UPDATE terminal_sessions SET status = ?, closedAt = ? WHERE id = ?').run(
      'closed',
      Date.now(),
      id
    )
  }

  deleteSession(id: string): void {
    this.stmt('DELETE FROM terminal_sessions WHERE id = ?').run(id)
  }

  getActiveSessions(): TerminalSession[] {
    const rows = this.stmt(
      'SELECT * FROM terminal_sessions WHERE status = ? ORDER BY createdAt DESC'
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
}
