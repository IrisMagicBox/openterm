import { describe, expect, it, vi } from 'vitest'

vi.mock('../../db', () => ({
  terminalSessionDB: {
    createSession: vi.fn(),
    updateSessionShellIntegration: vi.fn(),
    closeSession: vi.fn(),
    getSessionsByTopic: vi.fn(() => [])
  },
  terminalIODB: {
    createIO: vi.fn(),
    markIOAsDeletedBySession: vi.fn(),
    getIOBySession: vi.fn(() => []),
    getOutputByRelatedInput: vi.fn()
  },
  topicDB: {
    getTopicById: vi.fn(() => ({ hostIds: [] }))
  },
  hostDB: {
    getHosts: vi.fn(() => [])
  }
}))

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { encodeTerminalInput } from '../terminal-automation'

describe('terminal automation tools', () => {
  it('encodes text and special keys for TUI automation', () => {
    const encoded = encodeTerminalInput({
      sessionId: 'session-1',
      text: 'sudo tasksel',
      keys: ['Enter'],
      reason: 'start interactive installer'
    })

    expect(encoded.data).toBe('sudo tasksel\r')
    expect(encoded.recordedContent).toContain('text "sudo tasksel"')
    expect(encoded.recordedContent).toContain('key Enter')
  })

  it('preserves ordered text/key sequences', () => {
    const encoded = encodeTerminalInput({
      sessionId: 'session-1',
      sequence: [{ key: 'ArrowDown' }, { key: 'Space' }, { text: 'y' }, { key: 'Enter' }],
      reason: 'select a menu item'
    })

    expect(encoded.data).toBe('\x1b[B y\r')
    expect(encoded.recordedContent).toContain('key ArrowDown')
    expect(encoded.recordedContent).toContain('key Space')
  })

  it('rejects raw escape control characters in text input', () => {
    expect(() =>
      encodeTerminalInput({
        sessionId: 'session-1',
        text: '\x1b[A',
        reason: 'bad raw escape'
      })
    ).toThrow(/control characters/i)
  })
})
