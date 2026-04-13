import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { MemoryEntry } from '../../../shared/types'
import { MemoryRow } from '../row-types'
import { mapMemoryRow } from '../mappers'
import {
  MEMORY_SEARCH_DEFAULT_LIMIT,
  MEMORY_SEARCH_QUERY_LIMIT,
  MEMORY_SEARCH_SQL_LIMIT
} from '../../constants'
import { BaseRepository } from '../base-repository'

export class MemoryRepository extends BaseRepository<MemoryRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getMemories(hostId?: string): MemoryEntry[] {
    const query = hostId
      ? 'SELECT * FROM memories WHERE hostId = ? OR hostId IS NULL ORDER BY importance DESC, timestamp DESC'
      : 'SELECT * FROM memories ORDER BY importance DESC, timestamp DESC'
    const rows = this.stmt(query).all(hostId ? [hostId] : []) as MemoryRow[]
    return rows.map(mapMemoryRow)
  }

  createMemory(memory: Omit<MemoryEntry, 'id' | 'timestamp'>): MemoryEntry {
    const id = uuidv4()
    const timestamp = Date.now()
    const entry: MemoryEntry = { ...memory, id, timestamp }

    this.stmt(
      `
      INSERT INTO memories (id, type, content, hostId, topicId, importance, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      entry.type,
      entry.content,
      entry.hostId || null,
      entry.topicId || null,
      entry.importance,
      timestamp
    )

    return entry
  }

  deleteMemory(id: string): void {
    this.stmt('DELETE FROM memories WHERE id = ?').run(id)
  }

  searchRelevantMemories(query: string, hostId?: string): MemoryEntry[] {
    const all = this.getMemories(hostId)
    if (!query) return all.slice(0, MEMORY_SEARCH_DEFAULT_LIMIT)

    return all
      .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      .slice(0, MEMORY_SEARCH_QUERY_LIMIT)
  }

  searchMemories(query: string, scope?: { hostId?: string; topicId?: string }): MemoryEntry[] {
    let sql = 'SELECT * FROM memories WHERE 1=1'
    const params: (string | number)[] = []

    if (scope?.hostId) {
      sql += ' AND (hostId = ? OR hostId IS NULL)'
      params.push(scope.hostId)
    }
    if (scope?.topicId) {
      sql += ' AND (topicId = ? OR topicId IS NULL)'
      params.push(scope.topicId)
    }

    sql += ' AND content LIKE ?'
    params.push(`%${query}%`)

    sql += ` ORDER BY importance DESC, timestamp DESC LIMIT ${MEMORY_SEARCH_SQL_LIMIT}`

    const rows = this.stmt(sql).all(params) as MemoryRow[]
    return rows.map(mapMemoryRow)
  }
}
