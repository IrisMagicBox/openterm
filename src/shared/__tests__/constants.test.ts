import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEFAULT_SSH_PORT,
  WORKSPACE_TERMINALS_TOPIC_ID
} from '../constants'

describe('Shared Constants', () => {
  it('should have correct default model', () => {
    expect(DEFAULT_MODEL).toBe('gpt-4o-mini')
  })

  it('should have correct default base URL', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('should have correct default SSH port', () => {
    expect(DEFAULT_SSH_PORT).toBe(22)
  })

  it('should have a stable workspace terminals topic id', () => {
    expect(WORKSPACE_TERMINALS_TOPIC_ID).toBe('__workspace_terminals__')
  })
})
