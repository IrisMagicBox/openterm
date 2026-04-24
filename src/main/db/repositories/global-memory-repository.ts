import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory
} from '../../../shared/types'
import type { GlobalMemoryRow } from '../row-types'
import { BaseRepository } from '../base-repository'

const GLOBAL_MEMORY_ID = 'default'
const GLOBAL_MEMORY_VERSION = '1.0'
const DEFAULT_MAX_FACTS = 100

const FACT_CATEGORIES = new Set<GlobalMemoryFactCategory>([
  'preference',
  'knowledge',
  'context',
  'behavior',
  'goal',
  'correction'
])

export type GlobalMemoryFactInput = {
  content: string
  category?: GlobalMemoryFactCategory | string
  confidence?: number
  source?: string
  sourceError?: string
}

export type GlobalMemoryFactPatch = Partial<
  Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>
>

export function createEmptyGlobalMemory(now = Date.now()): GlobalMemoryData {
  return {
    version: GLOBAL_MEMORY_VERSION,
    lastUpdated: now,
    user: {
      workContext: { summary: '' },
      personalContext: { summary: '' },
      topOfMind: { summary: '' }
    },
    history: {
      recentMonths: { summary: '' },
      earlierContext: { summary: '' },
      longTermBackground: { summary: '' }
    },
    facts: []
  }
}

export class GlobalMemoryRepository extends BaseRepository<GlobalMemoryRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getMemory(): GlobalMemoryData {
    const row = this.stmt('SELECT * FROM global_memory WHERE id = ?').get(GLOBAL_MEMORY_ID) as
      | GlobalMemoryRow
      | undefined
    if (!row) return createEmptyGlobalMemory()

    try {
      return normalizeGlobalMemory(JSON.parse(row.data), row.updatedAt)
    } catch {
      return createEmptyGlobalMemory(row.updatedAt)
    }
  }

  saveMemory(memory: GlobalMemoryData): GlobalMemoryData {
    const now = Date.now()
    const normalized = normalizeGlobalMemory(memory, now)
    normalized.lastUpdated = now

    this.stmt(
      `
      INSERT INTO global_memory (id, data, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt
    `
    ).run(GLOBAL_MEMORY_ID, JSON.stringify(normalized), now)

    return normalized
  }

  importMemory(memory: GlobalMemoryData): GlobalMemoryData {
    return this.saveMemory(memory)
  }

  clearMemory(): GlobalMemoryData {
    return this.saveMemory(createEmptyGlobalMemory())
  }

  createFact(input: GlobalMemoryFactInput): GlobalMemoryData {
    const content = normalizeContent(input.content)
    if (!content) throw new Error('Global memory fact content cannot be empty.')

    const memory = this.getMemory()
    const now = Date.now()
    const fact: GlobalMemoryFact = {
      id: `fact_${uuidv4().replace(/-/g, '').slice(0, 8)}`,
      content,
      category: normalizeCategory(input.category),
      confidence: clampConfidence(input.confidence ?? 0.7),
      createdAt: now,
      source: normalizeContent(input.source) || 'manual',
      sourceError: normalizeContent(input.sourceError) || undefined
    }

    const existingKeys = new Set(memory.facts.map((item) => factContentKey(item.content)))
    if (!existingKeys.has(factContentKey(fact.content))) {
      memory.facts.push(fact)
    }

    return this.saveMemory(limitFacts(memory))
  }

  updateFact(factId: string, patch: GlobalMemoryFactPatch): GlobalMemoryData | undefined {
    const memory = this.getMemory()
    const index = memory.facts.findIndex((fact) => fact.id === factId)
    if (index === -1) return undefined

    const current = memory.facts[index]
    const next: GlobalMemoryFact = {
      ...current,
      content: patch.content === undefined ? current.content : normalizeContent(patch.content),
      category: patch.category === undefined ? current.category : normalizeCategory(patch.category),
      confidence:
        patch.confidence === undefined ? current.confidence : clampConfidence(patch.confidence),
      sourceError:
        patch.sourceError === undefined
          ? current.sourceError
          : normalizeContent(patch.sourceError) || undefined
    }

    if (!next.content) throw new Error('Global memory fact content cannot be empty.')
    memory.facts[index] = next
    return this.saveMemory(limitFacts(memory))
  }

  deleteFact(factId: string): GlobalMemoryData | undefined {
    const memory = this.getMemory()
    const nextFacts = memory.facts.filter((fact) => fact.id !== factId)
    if (nextFacts.length === memory.facts.length) return undefined
    memory.facts = nextFacts
    return this.saveMemory(memory)
  }
}

function normalizeGlobalMemory(value: unknown, fallbackUpdatedAt = Date.now()): GlobalMemoryData {
  const raw = isRecord(value) ? value : {}
  const memory = createEmptyGlobalMemory(toTimestamp(raw.lastUpdated) ?? fallbackUpdatedAt)

  memory.user.workContext = normalizeSection(raw.user, 'workContext')
  memory.user.personalContext = normalizeSection(raw.user, 'personalContext')
  memory.user.topOfMind = normalizeSection(raw.user, 'topOfMind')
  memory.history.recentMonths = normalizeSection(raw.history, 'recentMonths')
  memory.history.earlierContext = normalizeSection(raw.history, 'earlierContext')
  memory.history.longTermBackground = normalizeSection(raw.history, 'longTermBackground')

  if (Array.isArray(raw.facts)) {
    memory.facts = raw.facts
      .map((fact) => normalizeFact(fact, fallbackUpdatedAt))
      .filter((fact): fact is GlobalMemoryFact => fact !== undefined)
  }

  return limitFacts(memory)
}

function normalizeSection(parent: unknown, key: string): { summary: string; updatedAt?: number } {
  if (!isRecord(parent)) return { summary: '' }
  const section = parent[key]
  if (!isRecord(section)) return { summary: '' }
  const summary = normalizeContent(section.summary)
  const updatedAt = toTimestamp(section.updatedAt)
  return updatedAt ? { summary, updatedAt } : { summary }
}

function normalizeFact(value: unknown, fallbackCreatedAt: number): GlobalMemoryFact | undefined {
  if (!isRecord(value)) return undefined
  const content = normalizeContent(value.content)
  if (!content) return undefined

  return {
    id: normalizeContent(value.id) || `fact_${uuidv4().replace(/-/g, '').slice(0, 8)}`,
    content,
    category: normalizeCategory(value.category),
    confidence: clampConfidence(value.confidence ?? 0.7),
    createdAt: toTimestamp(value.createdAt) ?? fallbackCreatedAt,
    source: normalizeContent(value.source) || 'unknown',
    sourceError: normalizeContent(value.sourceError) || undefined
  }
}

function limitFacts(memory: GlobalMemoryData, maxFacts = DEFAULT_MAX_FACTS): GlobalMemoryData {
  if (memory.facts.length > maxFacts) {
    memory.facts = [...memory.facts]
      .sort((a, b) => b.confidence - a.confidence || b.createdAt - a.createdAt)
      .slice(0, maxFacts)
  }
  return memory
}

function normalizeCategory(value: unknown): GlobalMemoryFactCategory {
  if (typeof value === 'string' && FACT_CATEGORIES.has(value as GlobalMemoryFactCategory)) {
    return value as GlobalMemoryFactCategory
  }
  return 'context'
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0.7
  return Math.max(0, Math.min(1, parsed))
}

function normalizeContent(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function factContentKey(content: string): string {
  return content.trim().toLowerCase()
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
