import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Host } from '../../../shared/types'
import { HostRow } from '../row-types'
import { mapHostRow } from '../mappers'
import { BaseRepository } from '../base-repository'

function parseHostIds(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

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
      INSERT INTO hosts (id, alias, ip, port, username, password, keyPath, keyContent, keyPassphrase, tags, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      host.alias,
      host.ip,
      host.port,
      host.username,
      host.password ?? null,
      host.keyPath ?? null,
      host.keyContent ?? null,
      host.keyPassphrase ?? null,
      tagsStr,
      createdAt
    )

    return { ...host, id, createdAt }
  }

  deleteHost(id: string): void {
    if (id === 'local') {
      throw new Error('Cannot delete the built-in local host')
    }

    const deleteHostTx = this.db.transaction((hostId: string) => {
      const topicRows = this.stmt('SELECT id, hostIds FROM topics').all() as Array<{
        id: string
        hostIds: string | null
      }>
      const updateTopicHosts = this.stmt('UPDATE topics SET hostIds = ? WHERE id = ?')

      for (const row of topicRows) {
        const hostIds = parseHostIds(row.hostIds)
        if (!hostIds.includes(hostId)) continue
        updateTopicHosts.run(
          JSON.stringify(hostIds.filter((topicHostId) => topicHostId !== hostId)),
          row.id
        )
      }

      this.stmt('DELETE FROM terminal_io WHERE hostId = ?').run(hostId)
      this.stmt('DELETE FROM terminal_sessions WHERE hostId = ?').run(hostId)
      this.stmt('UPDATE memories SET hostId = NULL WHERE hostId = ?').run(hostId)
      this.stmt('DELETE FROM command_patterns WHERE hostId = ?').run(hostId)
      this.stmt('DELETE FROM hosts WHERE id = ?').run(hostId)
    })

    deleteHostTx(id)
  }

  getHostById(id: string): Host | undefined {
    const row = this.stmt('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined
    return row ? mapHostRow(row) : undefined
  }

  updateHost(id: string, updates: Partial<Omit<Host, 'id' | 'createdAt'>>): Host | undefined {
    const existing = this.getHostById(id)
    if (!existing) return undefined
    const alias = updates.alias !== undefined ? updates.alias : existing.alias
    const ip = updates.ip !== undefined ? updates.ip : existing.ip
    const port = updates.port !== undefined ? updates.port : existing.port
    const username = updates.username !== undefined ? updates.username : existing.username
    const password = Object.prototype.hasOwnProperty.call(updates, 'password')
      ? updates.password
      : existing.password
    const keyPath = Object.prototype.hasOwnProperty.call(updates, 'keyPath')
      ? updates.keyPath
      : existing.keyPath
    const keyContent = Object.prototype.hasOwnProperty.call(updates, 'keyContent')
      ? updates.keyContent
      : existing.keyContent
    const keyPassphrase = Object.prototype.hasOwnProperty.call(updates, 'keyPassphrase')
      ? updates.keyPassphrase
      : existing.keyPassphrase
    const tagsStr =
      updates.tags !== undefined ? JSON.stringify(updates.tags) : JSON.stringify(existing.tags)
    const agentNotes = updates.agentNotes !== undefined ? updates.agentNotes : existing.agentNotes
    this.stmt(
      `
      UPDATE hosts
      SET alias = ?, ip = ?, port = ?, username = ?, password = ?, keyPath = ?, keyContent = ?, keyPassphrase = ?, tags = ?, agentNotes = ?
      WHERE id = ?
    `
    ).run(
      alias,
      ip,
      port,
      username,
      password ?? null,
      keyPath ?? null,
      keyContent ?? null,
      keyPassphrase ?? null,
      tagsStr,
      agentNotes ?? null,
      id
    )
    return this.getHostById(id)
  }

  updateAgentNotes(id: string, notes: string): void {
    this.stmt('UPDATE hosts SET agentNotes = ? WHERE id = ?').run(notes, id)
  }
}
