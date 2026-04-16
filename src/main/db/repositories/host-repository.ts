import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Host } from '../../../shared/types'
import { HostRow } from '../row-types'
import { mapHostRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class HostRepository extends BaseRepository<HostRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getHosts(): Host[] {
    const rows = this.stmt('SELECT * FROM hosts ORDER BY createdAt DESC').all() as HostRow[]
    return rows.map(mapHostRow)
  }

  createHost(host: Omit<Host, 'id' | 'createdAt'>): Host {
    const id = uuidv4()
    const createdAt = Date.now()
    const tagsStr = JSON.stringify(host.tags)

    this.stmt(
      `
      INSERT INTO hosts (id, alias, ip, port, username, password, keyPath, tags, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      host.alias,
      host.ip,
      host.port,
      host.username,
      host.password,
      host.keyPath,
      tagsStr,
      createdAt
    )

    return { ...host, id, createdAt }
  }

  deleteHost(id: string): void {
    this.stmt('DELETE FROM hosts WHERE id = ?').run(id)
  }

  getHostById(id: string): Host | undefined {
    const row = this.stmt('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined
    return row ? mapHostRow(row) : undefined
  }

  updateHost(id: string, updates: Partial<Pick<Host, 'alias' | 'tags' | 'agentNotes'>>): void {
    const existing = this.getHostById(id)
    if (!existing) return
    const alias = updates.alias !== undefined ? updates.alias : existing.alias
    const tagsStr =
      updates.tags !== undefined ? JSON.stringify(updates.tags) : JSON.stringify(existing.tags)
    const agentNotes = updates.agentNotes !== undefined ? updates.agentNotes : existing.agentNotes
    this.stmt('UPDATE hosts SET alias = ?, tags = ?, agentNotes = ? WHERE id = ?').run(
      alias,
      tagsStr,
      agentNotes,
      id
    )
  }

  updateAgentNotes(id: string, notes: string): void {
    this.stmt('UPDATE hosts SET agentNotes = ? WHERE id = ?').run(notes, id)
  }
}
