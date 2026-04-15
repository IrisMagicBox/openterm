import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { truncateOutput } from '../truncation'
import { TRUNCATION_MAX_BYTES, TRUNCATION_DIR_NAME } from '../../constants'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-openterm/${name}` }
}))

describe('truncateOutput', () => {
  const topicId = 'test-topic'
  const userDataPath = `/tmp/test-openterm/userData`

  beforeEach(() => {
    // Clean up truncation dir before each test
    const dir = path.join(userDataPath, TRUNCATION_DIR_NAME, topicId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true })
    }
  })

  it('returns content unchanged when under both limits', () => {
    const text = 'hello world\nsecond line'
    const result = truncateOutput(text, topicId)

    expect(result.content).toBe(text)
    expect(result.truncated).toBe(false)
    expect(result.outputPath).toBeUndefined()
    expect(result.originalLines).toBeUndefined()
    expect(result.originalBytes).toBeUndefined()
  })

  it('truncates when exceeding max lines', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join('\n')
    const result = truncateOutput(text, topicId)

    expect(result.truncated).toBe(true)
    expect(result.originalLines).toBe(3000)
    expect(result.outputPath).toBeDefined()
    expect(result.content).toContain('saved to:')
    expect(result.content).toContain('read_file')

    // Verify full output saved to disk
    expect(fs.existsSync(result.outputPath!)).toBe(true)
    expect(fs.readFileSync(result.outputPath!, 'utf-8')).toBe(text)
  })

  it('truncates when exceeding max bytes', () => {
    // Create a short text that exceeds the byte limit
    const text = 'x'.repeat(TRUNCATION_MAX_BYTES + 10000)
    const result = truncateOutput(text, topicId)

    expect(result.truncated).toBe(true)
    expect(result.originalBytes).toBeGreaterThan(TRUNCATION_MAX_BYTES)
    expect(result.outputPath).toBeDefined()
    expect(result.content).toContain('saved to:')

    // Verify full output saved to disk
    expect(fs.existsSync(result.outputPath!)).toBe(true)
    expect(fs.readFileSync(result.outputPath!, 'utf-8')).toBe(text)
  })

  it('includes disk path hint in truncated output', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join('\n')
    const result = truncateOutput(text, topicId)

    expect(result.content).toContain('saved to:')
    expect(result.content).toContain('read_file')
    expect(result.content).toContain('search_memory')
  })

  it('preserves head and tail of output', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join('\n')
    const result = truncateOutput(text, topicId)

    expect(result.content).toContain('line 0')
    expect(result.content).toContain('line 2999')
  })

  it('uses stepId in filename when provided', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join('\n')
    const result = truncateOutput(text, topicId, 'step-42')

    expect(result.outputPath).toContain('step-42.txt')
  })

  it('falls back to timestamp filename when no stepId', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join('\n')
    const result = truncateOutput(text, topicId)

    expect(result.outputPath).toMatch(/\d+\.txt$/)
  })
})
