import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { MemoryEntry, MemoryScope, MemoryType } from '../../../shared/types'
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

  getMemories(
    filters: { hostId?: string; topicId?: string; includeDisabled?: boolean } = {}
  ): MemoryEntry[] {
    let query = 'SELECT * FROM memories WHERE 1=1'
    const params: string[] = []

    if (filters.hostId) {
      query += ' AND (hostId = ? OR hostId IS NULL)'
      params.push(filters.hostId)
    }
    if (filters.topicId) {
      query += ' AND (topicId = ? OR topicId IS NULL)'
      params.push(filters.topicId)
    }
    if (!filters.includeDisabled) {
      query += ' AND COALESCE(disabled, 0) = 0'
    }
    query += ' ORDER BY importance DESC, timestamp DESC'

    const rows = this.stmt(query).all(params) as MemoryRow[]
    return rows.map(mapMemoryRow)
  }

  createMemory(
    memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> &
      Partial<Pick<MemoryEntry, 'scope'>>
  ): MemoryEntry {
    const id = uuidv4()
    const timestamp = Date.now()
    const entry: MemoryEntry = {
      ...memory,
      id,
      type: normalizeMemoryType(memory.type),
      scope: memory.scope ?? inferScope(memory),
      confidence: memory.confidence ?? 0.7,
      disabled: memory.disabled ?? false,
      timestamp
    }

    this.stmt(
      `
      INSERT INTO memories (
        id, type, scope, content, hostId, topicId, sourceTaskId,
        confidence, importance, lastUsedAt, disabled, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      entry.type,
      entry.scope,
      entry.content,
      entry.hostId || null,
      entry.topicId || null,
      entry.sourceTaskId || null,
      entry.confidence ?? 0.7,
      entry.importance,
      entry.lastUsedAt || null,
      entry.disabled ? 1 : 0,
      timestamp
    )

    return entry
  }

  updateMemory(
    id: string,
    updates: Partial<
      Pick<
        MemoryEntry,
        'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
      >
    >
  ): MemoryEntry | undefined {
    const existing = this.stmt('SELECT * FROM memories WHERE id = ?').get(id) as
      | MemoryRow
      | undefined
    if (!existing) return undefined

    const next = {
      type: normalizeMemoryType(updates.type ?? existing.type),
      scope: updates.scope ?? existing.scope ?? inferScope(mapMemoryRow(existing)),
      content: updates.content ?? existing.content,
      importance: updates.importance ?? existing.importance,
      confidence: updates.confidence ?? existing.confidence ?? 0.7,
      disabled: updates.disabled === undefined ? existing.disabled : updates.disabled ? 1 : 0,
      lastUsedAt: updates.lastUsedAt ?? existing.lastUsedAt
    }

    this.stmt(
      `
      UPDATE memories
      SET type = ?, scope = ?, content = ?, importance = ?, confidence = ?,
          disabled = ?, lastUsedAt = ?
      WHERE id = ?
    `
    ).run(
      next.type,
      next.scope,
      next.content,
      next.importance,
      next.confidence,
      next.disabled,
      next.lastUsedAt || null,
      id
    )

    const row = this.stmt('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow
    return mapMemoryRow(row)
  }

  deleteMemory(id: string): void {
    this.stmt('DELETE FROM memories WHERE id = ?').run(id)
  }

  searchRelevantMemories(query: string, hostId?: string): MemoryEntry[] {
    const all = this.getMemories({ hostId })
    if (!query) return all.slice(0, MEMORY_SEARCH_DEFAULT_LIMIT)

    return all
      .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      .slice(0, MEMORY_SEARCH_QUERY_LIMIT)
  }

  searchMemories(query: string, scope?: { hostId?: string; topicId?: string }): MemoryEntry[] {
    let sql = 'SELECT * FROM memories WHERE 1=1 AND COALESCE(disabled, 0) = 0'
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

  touchMemories(ids: string[]): void {
    if (ids.length === 0) return
    const now = Date.now()
    const update = this.stmt('UPDATE memories SET lastUsedAt = ? WHERE id = ?')
    const tx = this.db.transaction((memoryIds: string[]) => {
      for (const id of memoryIds) update.run(now, id)
    })
    tx(ids)
  }
}

function normalizeMemoryType(type: string): MemoryType {
  if (type === 'habit') return 'user_preference'
  if (type === 'experience') return 'task_experience'
  if (
    type === 'user_preference' ||
    type === 'host_fact' ||
    type === 'topic_summary' ||
    type === 'task_experience' ||
    type === 'policy_hint'
  ) {
    return type
  }
  return 'task_experience'
}

function inferScope(memory: Pick<MemoryEntry, 'hostId' | 'topicId'>): MemoryScope {
  if (memory.hostId) return 'host'
  if (memory.topicId) return 'topic'
  return 'global'
}
