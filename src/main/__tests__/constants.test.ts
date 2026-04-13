import { describe, it, expect } from 'vitest'
import {
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  PROVIDER_CONNECTION_TIMEOUT_MS,
  TERMINAL_BUFFER_SIZE,
  SSH_RAW_BUFFER_MAX,
  SSH_RAW_BUFFER_TRIM,
  MAX_OUTPUT_SIZE,
  STREAMING_CHUNK_SIZE,
  STREAMING_FLUSH_INTERVAL_MS,
  COMMAND_TIMEOUT_MS,
  RAW_BUFFER_MAX,
  RAW_BUFFER_TRIM,
  TRUNCATION_HEAD_SIZE,
  TRUNCATION_TAIL_SIZE,
  LOCAL_BUFFER_MAX,
  LOCAL_BUFFER_TRIM,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_AGENT_TURNS,
  AGENT_TEMPERATURE,
  TASK_SUMMARY_MAX_LENGTH,
  DISTILLATION_THRESHOLD,
  DISTILLATION_MAX_LENGTH,
  REFLECTION_STEPS_LIMIT,
  REFLECTION_STEP_CONTENT_MAX,
  TRUST_APPROVAL_THRESHOLD,
  TRUST_FAMILIAR_THRESHOLD,
  TRUST_REJECTION_THRESHOLD,
  MEMORY_SEARCH_DEFAULT_LIMIT,
  MEMORY_SEARCH_QUERY_LIMIT,
  MEMORY_SEARCH_SQL_LIMIT,
  TERMINAL_IO_SESSION_LIMIT,
  TERMINAL_IO_TOPIC_LIMIT,
  RECENT_INPUTS_LIMIT
} from '../constants'

describe('Main Constants - Window', () => {
  it('should have correct default window dimensions', () => {
    expect(WINDOW_DEFAULT_WIDTH).toBe(1100)
    expect(WINDOW_DEFAULT_HEIGHT).toBe(750)
  })
})

describe('Main Constants - Provider', () => {
  it('should have provider connection timeout of 20 seconds', () => {
    expect(PROVIDER_CONNECTION_TIMEOUT_MS).toBe(20000)
  })
})

describe('Main Constants - SSH Terminal', () => {
  it('should have correct terminal buffer sizes', () => {
    expect(TERMINAL_BUFFER_SIZE).toBe(2000)
    expect(SSH_RAW_BUFFER_MAX).toBe(10000)
    expect(SSH_RAW_BUFFER_TRIM).toBe(5000)
  })
})

describe('Main Constants - Terminal Output', () => {
  it('should have correct output and streaming constants', () => {
    expect(MAX_OUTPUT_SIZE).toBe(50000)
    expect(STREAMING_CHUNK_SIZE).toBe(10000)
    expect(STREAMING_FLUSH_INTERVAL_MS).toBe(5000)
    expect(COMMAND_TIMEOUT_MS).toBe(60000)
  })

  it('should have correct buffer and truncation constants', () => {
    expect(RAW_BUFFER_MAX).toBe(1000)
    expect(RAW_BUFFER_TRIM).toBe(500)
    expect(TRUNCATION_HEAD_SIZE).toBe(30000)
    expect(TRUNCATION_TAIL_SIZE).toBe(20000)
  })
})

describe('Main Constants - Local Terminal', () => {
  it('should have correct local terminal buffer sizes', () => {
    expect(LOCAL_BUFFER_MAX).toBe(50000)
    expect(LOCAL_BUFFER_TRIM).toBe(30000)
    expect(DEFAULT_TERMINAL_COLS).toBe(80)
    expect(DEFAULT_TERMINAL_ROWS).toBe(24)
  })
})

describe('Main Constants - Agent', () => {
  it('should have correct agent runner constants', () => {
    expect(MAX_AGENT_TURNS).toBe(10)
    expect(AGENT_TEMPERATURE).toBe(0.1)
    expect(TASK_SUMMARY_MAX_LENGTH).toBe(500)
  })
})

describe('Main Constants - Memory', () => {
  it('should have correct distillation thresholds', () => {
    expect(DISTILLATION_THRESHOLD).toBe(500)
    expect(DISTILLATION_MAX_LENGTH).toBe(5000)
  })

  it('should have correct reflection limits', () => {
    expect(REFLECTION_STEPS_LIMIT).toBe(20)
    expect(REFLECTION_STEP_CONTENT_MAX).toBe(500)
  })
})

describe('Main Constants - Trust System', () => {
  it('should have correct trust thresholds', () => {
    expect(TRUST_APPROVAL_THRESHOLD).toBe(3)
    expect(TRUST_FAMILIAR_THRESHOLD).toBe(2)
    expect(TRUST_REJECTION_THRESHOLD).toBe(1)
  })
})

describe('Main Constants - Database Limits', () => {
  it('should have correct memory search limits', () => {
    expect(MEMORY_SEARCH_DEFAULT_LIMIT).toBe(5)
    expect(MEMORY_SEARCH_QUERY_LIMIT).toBe(10)
    expect(MEMORY_SEARCH_SQL_LIMIT).toBe(20)
  })

  it('should have correct terminal IO and input limits', () => {
    expect(TERMINAL_IO_SESSION_LIMIT).toBe(100)
    expect(TERMINAL_IO_TOPIC_LIMIT).toBe(200)
    expect(RECENT_INPUTS_LIMIT).toBe(20)
  })
})
