import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
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

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { commandExecutor } from '../terminal'
import { terminalSessionDB } from '../db'

function createFakeStream(): { write: (data: string) => void } {
  return {
    write: vi.fn()
  }
}

describe('CommandExecutor shell integration parsing', () => {
  it('completes an active command when OSC_END arrives in the raw stream', async () => {
    const sessionId = `session-${Date.now()}`
    const stream = createFakeStream()

    await commandExecutor.createSession(
      sessionId,
      'topic-1',
      'local',
      'Local',
      stream as never,
      undefined,
      false
    )

    const resultPromise = commandExecutor.executeAgentCommand(sessionId, 'echo hi', 'topic-1')

    await vi.waitFor(() => expect(stream.write).toHaveBeenCalledWith('echo hi\n'))

    const parsed = commandExecutor.handleStreamOutput(
      sessionId,
      Buffer.from('echo hi\r\nhi\r\n\x1b]6973;OPENTERM_CMD_END;0;/tmp\x07')
    )

    expect(parsed.isCommandEnd).toBe(true)
    expect(parsed.cleanData).not.toContain('OPENTERM_CMD_END')

    const result = await resultPromise
    expect(result.exitCode).toBe(0)
    expect(result.cwd).toBe('/tmp')
    expect(result.content).toContain('hi')
  })

  it('marks shell integration ready before stripping OSC_START from display output', async () => {
    const sessionId = `session-${Date.now()}-start`
    const stream = createFakeStream()

    await commandExecutor.createSession(
      sessionId,
      'topic-1',
      'local',
      'Local',
      stream as never,
      undefined,
      false
    )

    const parsed = commandExecutor.handleStreamOutput(
      sessionId,
      Buffer.from('\x1b]6973;OPENTERM_CMD_START\x07')
    )

    expect(parsed.cleanData).toBe('')
    expect(terminalSessionDB.updateSessionShellIntegration).toHaveBeenCalledWith(sessionId, true)
  })
})
