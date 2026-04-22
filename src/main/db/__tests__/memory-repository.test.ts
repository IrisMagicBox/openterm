import { describe, expect, it } from 'vitest'
import { MemoryRepository } from '../repositories/memory-repository'
import type { MemoryRow } from '../row-types'

type MemoryTableRow = MemoryRow

function createRepo(initialRows: MemoryTableRow[] = []): {
  repo: MemoryRepository
  rows: MemoryTableRow[]
} {
  const rows = Array.isArray(initialRows) ? initialRows : []
  const db = {
    prepare: (sql: string) => new FakeStatement(rows, sql)
  }
  return { repo: new MemoryRepository(db as never), rows }
}

class FakeStatement {
  constructor(
    private readonly rows: MemoryTableRow[],
    private readonly sql: string
  ) {}

  run(...params: unknown[]): void {
    if (!this.sql.includes('INSERT INTO memories')) return
    const [
      id,
      type,
      scope,
      content,
      hostId,
      topicId,
      sourceTaskId,
      confidence,
      importance,
      lastUsedAt,
      disabled,
      timestamp
    ] = params
    this.rows.push({
      id: String(id),
      type: String(type),
      scope: scope == null ? null : String(scope),
      content: String(content),
      hostId: hostId == null ? null : String(hostId),
      topicId: topicId == null ? null : String(topicId),
      sourceTaskId: sourceTaskId == null ? null : String(sourceTaskId),
      confidence: confidence == null ? null : Number(confidence),
      importance: Number(importance),
      lastUsedAt: lastUsedAt == null ? null : Number(lastUsedAt),
      disabled: Number(disabled),
      timestamp: Number(timestamp)
    })
  }

  get(id: string): MemoryTableRow | undefined {
    return this.rows.find((row) => row.id === id)
  }

  all(params: unknown[] = []): MemoryTableRow[] {
    const sql = this.sql.replace(/\s+/g, ' ')
    let index = 0
    let result = [...this.rows]

    if (sql.includes('(hostId = ? OR hostId IS NULL)')) {
      const hostId = params[index++]
      result = result.filter((row) => row.hostId === hostId || row.hostId == null)
    }
    if (sql.includes('(topicId = ? OR topicId IS NULL)')) {
      const topicId = params[index++]
      result = result.filter((row) => row.topicId === topicId || row.topicId == null)
    }
    if (sql.includes('COALESCE(disabled, 0) = 0')) {
      result = result.filter((row) => row.disabled !== 1)
    }

    return result.sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp)
  }
}

describe('MemoryRepository taxonomy', () => {
  it('creates memories with inferred scope and default metadata', () => {
    const { repo } = createRepo()
    const memory = repo.createMemory({
      type: 'host_fact',
      content: 'nginx listens on 8080',
      hostId: 'host-1',
      importance: 4
    })

    expect(memory.scope).toBe('host')
    expect(memory.confidence).toBe(0.7)
    expect(memory.disabled).toBe(false)
  })

  it('maps legacy memory types to the new taxonomy', () => {
    const { repo } = createRepo([
      {
        id: 'legacy-1',
        type: 'habit',
        scope: null,
        content: 'prefer htop',
        hostId: null,
        topicId: null,
        sourceTaskId: null,
        confidence: null,
        importance: 3,
        lastUsedAt: null,
        disabled: 0,
        timestamp: Date.now()
      }
    ])

    const legacy = repo.getMemories({ includeDisabled: true })[0]
    expect(legacy.type).toBe('user_preference')
    expect(legacy.scope).toBe('global')
  })

  it('filters disabled memories unless explicitly requested', () => {
    const { repo } = createRepo()
    repo.createMemory({
      type: 'topic_summary',
      topicId: 'topic-1',
      content: 'deployment topic',
      importance: 3
    })
    repo.createMemory({
      type: 'task_experience',
      topicId: 'topic-1',
      content: 'disabled experience',
      importance: 9,
      disabled: true
    })

    expect(repo.getMemories({ topicId: 'topic-1' })).toHaveLength(1)
    expect(repo.getMemories({ topicId: 'topic-1', includeDisabled: true })).toHaveLength(2)
  })
})
