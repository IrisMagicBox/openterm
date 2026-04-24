import { describe, expect, it } from 'vitest'
import type { GlobalMemoryRow } from '../row-types'
import {
  createEmptyGlobalMemory,
  GlobalMemoryRepository
} from '../repositories/global-memory-repository'

function createRepo(initialRow?: GlobalMemoryRow): {
  repo: GlobalMemoryRepository
  row: { current?: GlobalMemoryRow }
} {
  const row = { current: initialRow }
  const db = {
    prepare: (sql: string) => new FakeStatement(row, sql)
  }
  return { repo: new GlobalMemoryRepository(db as never), row }
}

class FakeStatement {
  constructor(
    private readonly row: { current?: GlobalMemoryRow },
    private readonly sql: string
  ) {}

  get(id: string): GlobalMemoryRow | undefined {
    if (!this.sql.includes('SELECT * FROM global_memory')) return undefined
    return this.row.current?.id === id ? this.row.current : undefined
  }

  run(id: string, data: string, updatedAt: number): void {
    if (!this.sql.includes('INSERT INTO global_memory')) return
    this.row.current = { id, data, updatedAt }
  }
}

describe('GlobalMemoryRepository', () => {
  it('returns an empty structured-style memory profile by default', () => {
    const { repo } = createRepo()

    const memory = repo.getMemory()

    expect(memory.version).toBe('1.0')
    expect(memory.user.workContext.summary).toBe('')
    expect(memory.history.recentMonths.summary).toBe('')
    expect(memory.facts).toEqual([])
  })

  it('persists a global fact and deduplicates by normalized content', () => {
    const { repo } = createRepo()

    repo.createFact({
      content: '用户偏好中文回复',
      category: 'preference',
      confidence: 0.95,
      sourceTaskId: 'task-1',
      sourceRunId: 'run-1'
    })
    const memory = repo.createFact({
      content: ' 用户偏好中文回复 ',
      category: 'preference',
      confidence: 0.95
    })

    expect(memory.facts).toHaveLength(1)
    expect(memory.facts[0]).toMatchObject({
      content: '用户偏好中文回复',
      category: 'preference',
      confidence: 0.95,
      source: 'manual',
      sourceTaskId: 'task-1',
      sourceRunId: 'run-1'
    })
    expect(memory.facts[0].updatedAt).toBeGreaterThanOrEqual(memory.facts[0].createdAt)
  })

  it('imports and normalizes persisted profile data', () => {
    const { repo } = createRepo()
    const imported = createEmptyGlobalMemory()
    imported.user.topOfMind.summary = '正在建设 OpenTerm 全局记忆系统。'
    imported.facts.push({
      id: 'fact_known',
      content: 'OpenTerm 使用 TypeScript 和 Electron。',
      category: 'knowledge',
      confidence: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'test'
    })

    const saved = repo.importMemory(imported)
    const loaded = repo.getMemory()

    expect(saved.lastUpdated).toBeGreaterThanOrEqual(imported.lastUpdated)
    expect(loaded.user.topOfMind.summary).toContain('OpenTerm')
    expect(loaded.facts[0].category).toBe('knowledge')
    expect(loaded.facts[0].updatedAt).toBeGreaterThan(0)
  })
})
