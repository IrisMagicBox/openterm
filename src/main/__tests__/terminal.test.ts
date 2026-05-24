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
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { classifyTerminalScreen, commandExecutor } from '../terminal'
import { terminalIODB, terminalSessionDB } from '../db'

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
    expect(parsed.displayData).not.toContain('OPENTERM_CMD_END')

    const result = await resultPromise
    expect(result.exitCode).toBe(0)
    expect(result.cwd).toBe('/tmp')
    expect(result.content).toContain('hi')
  })

  it('interrupts an agent command when user input takes over and drops the first key', async () => {
    const sessionId = `session-${Date.now()}-takeover`
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

    const resultPromise = commandExecutor.executeAgentCommand(sessionId, 'sleep 10', 'topic-1')
    await vi.waitFor(() => expect(stream.write).toHaveBeenCalledWith('sleep 10\n'))

    commandExecutor.handleUserInput(sessionId, 'x', 'topic-1')

    await expect(resultPromise).rejects.toThrow('Command interrupted by user takeover')
    expect(stream.write).toHaveBeenCalledWith('\x03')
    expect(stream.write).not.toHaveBeenCalledWith('x')
    expect(commandExecutor.isSessionLocked(sessionId)).toEqual({ locked: true, lockedBy: 'user' })
    expect(commandExecutor.getSessionControlState(sessionId)).toMatchObject({
      paused: false,
      takeoverMode: 'auto',
      lockedBy: 'user'
    })
  })

  it('auto-resumes agent input after automatic takeover', async () => {
    const sessionId = `session-${Date.now()}-resume-input`
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

    commandExecutor.takeoverSessionByUser(sessionId, 'auto')

    await commandExecutor.sendAgentInput(sessionId, 'j', 'topic-1', 'key j')

    expect(stream.write).toHaveBeenCalledWith('j')
    expect(commandExecutor.getSessionControlState(sessionId)).toMatchObject({
      paused: false,
      takeoverMode: null,
      lockedBy: null,
      isLocked: false
    })
  })

  it('passes tab input through to the shell for native completion', async () => {
    const sessionId = `session-${Date.now()}-tab-completion`
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

    commandExecutor.handleUserInput(sessionId, 'gi', 'topic-1')
    commandExecutor.handleUserInput(sessionId, '\t', 'topic-1')

    expect(stream.write).toHaveBeenCalledWith('gi')
    expect(stream.write).toHaveBeenCalledWith('\t')
  })

  it('records a command draft inserted after clearing the current line', async () => {
    const sessionId = `session-${Date.now()}-command-draft`
    const stream = createFakeStream()
    vi.mocked(terminalIODB.createIO).mockClear()

    await commandExecutor.createSession(
      sessionId,
      'topic-1',
      'local',
      'Local',
      stream as never,
      undefined,
      false
    )

    commandExecutor.handleUserInput(sessionId, 'partial', 'topic-1')
    commandExecutor.handleUserInput(sessionId, '\x15npm test', 'topic-1')
    commandExecutor.handleUserInput(sessionId, '\r', 'topic-1')

    expect(stream.write).toHaveBeenCalledWith('\x15npm test')
    expect(terminalIODB.createIO).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        topicId: 'topic-1',
        source: 'user',
        content: 'npm test'
      })
    )
  })

  it('does not start command lifecycle for user terminal input', async () => {
    const sessionId = `session-${Date.now()}-raw-user-input`
    const stream = createFakeStream()
    vi.mocked(terminalIODB.createIO).mockClear()

    await commandExecutor.createSession(
      sessionId,
      'topic-1',
      'local',
      'Local',
      stream as never,
      undefined,
      false,
      'user'
    )

    commandExecutor.handleUserInput(sessionId, 'whoami', 'topic-1')
    commandExecutor.handleUserInput(sessionId, '\r', 'topic-1')

    expect(stream.write).toHaveBeenCalledWith('whoami')
    expect(stream.write).toHaveBeenCalledWith('\r')
    expect(commandExecutor.canAcceptAgentCommand(sessionId)).toEqual({ ok: true })
    expect(terminalIODB.createIO).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        topicId: 'topic-1',
        source: 'user',
        content: 'whoami'
      })
    )
  })

  it('blocks agent input during manual pause until the user resumes', async () => {
    const sessionId = `session-${Date.now()}-manual-pause`
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

    expect(commandExecutor.setSessionPaused(sessionId, true)).toBe(true)
    expect(commandExecutor.getSessionControlState(sessionId)).toMatchObject({
      paused: true,
      takeoverMode: 'manual',
      lockedBy: 'user'
    })

    await expect(
      commandExecutor.sendAgentInput(sessionId, 'j', 'topic-1', 'key j')
    ).rejects.toThrow('manual user takeover')
    expect(stream.write).not.toHaveBeenCalledWith('j')

    expect(commandExecutor.setSessionPaused(sessionId, false)).toBe(true)
    await commandExecutor.sendAgentInput(sessionId, 'k', 'topic-1', 'key k')
    expect(stream.write).toHaveBeenCalledWith('k')
  })

  it('auto-resumes executeAgentCommand after temporary user takeover', async () => {
    const sessionId = `session-${Date.now()}-resume-command`
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

    commandExecutor.takeoverSessionByUser(sessionId, 'auto')

    const resultPromise = commandExecutor.executeAgentCommand(sessionId, 'pwd', 'topic-1')
    await vi.waitFor(() => expect(stream.write).toHaveBeenCalledWith('pwd\n'))

    commandExecutor.handleStreamOutput(
      sessionId,
      Buffer.from('pwd\r\n/tmp\r\n\x1b]6973;OPENTERM_CMD_END;0;/tmp\x07')
    )

    const result = await resultPromise
    expect(result.exitCode).toBe(0)
    expect(commandExecutor.getSessionControlState(sessionId)).toMatchObject({
      paused: false,
      takeoverMode: null,
      lockedBy: null,
      isLocked: false
    })
  })

  it('returns a timed out result and interrupts the foreground command', async () => {
    const sessionId = `session-${Date.now()}-timeout`
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

    const result = await commandExecutor.executeAgentCommand(
      sessionId,
      'sleep 10',
      'topic-1',
      undefined,
      undefined,
      {
        timeoutMs: 50
      }
    )

    expect(stream.write).toHaveBeenCalledWith('sleep 10\n')
    expect(stream.write).toHaveBeenCalledWith('\x03')
    expect(result.exitCode).toBe(-1)
    expect(result.timedOut).toBe(true)
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
    expect(parsed.displayData).toBe('')
    expect(terminalSessionDB.updateSessionShellIntegration).toHaveBeenCalledWith(sessionId, true)
  })

  it('returns separate clean and display data for visible output', async () => {
    const sessionId = `session-${Date.now()}-display-data`
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
      Buffer.from('prompt$ echo hi\r\nhi\r\n')
    )

    expect(parsed.cleanData).toBe('prompt$ echo hi\r\nhi\r\n')
    expect(parsed.displayData).toBe('prompt$ echo hi\r\nhi\r\n')
  })

  it('keeps a readable headless screen snapshot for interactive terminals', async () => {
    const sessionId = `session-${Date.now()}-screen`
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

    commandExecutor.handleStreamOutput(sessionId, Buffer.from('Choose an option:\r\n> Continue'))

    const snapshot = await commandExecutor.getTerminalSnapshot(sessionId)
    expect(snapshot.sessionId).toBe(sessionId)
    expect(snapshot.visibleText).toContain('Choose an option:')
    expect(snapshot.visibleText).toContain('> Continue')
    expect(snapshot.bufferType).toBe('normal')
  })

  it('records screen history entries only when the visible screen changes', async () => {
    const sessionId = `session-${Date.now()}-history`
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

    commandExecutor.handleStreamOutput(sessionId, Buffer.from('Step 1'))
    await commandExecutor.getTerminalSnapshot(sessionId)
    const firstHistory = await commandExecutor.getTerminalHistory(sessionId)

    commandExecutor.handleStreamOutput(sessionId, Buffer.from(''))
    await commandExecutor.getTerminalSnapshot(sessionId)
    const secondHistory = await commandExecutor.getTerminalHistory(sessionId)

    expect(firstHistory).toHaveLength(1)
    expect(secondHistory).toHaveLength(1)
    expect(firstHistory[0].excerpt).toContain('Step 1')
    expect(firstHistory[0].changedLines.length).toBeGreaterThan(0)
  })

  it('waits for fresh terminal activity without matching stale text', async () => {
    const sessionId = `session-${Date.now()}-fresh`
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

    commandExecutor.handleStreamOutput(sessionId, Buffer.from('SYNTHESIZE'))
    await commandExecutor.getTerminalSnapshot(sessionId)

    const staleResult = await commandExecutor.waitForTerminalActivity(sessionId, {
      stopText: 'SYNTHESIZE',
      timeoutMs: 300,
      idleMs: 1000,
      requireFreshMatch: true
    })

    expect(staleResult.status).toBe('timeout')

    const freshWait = commandExecutor.waitForTerminalActivity(sessionId, {
      stopText: 'DONE',
      timeoutMs: 2000,
      idleMs: 1000,
      requireFreshMatch: true
    })
    setTimeout(() => {
      commandExecutor.handleStreamOutput(sessionId, Buffer.from('\r\nDONE'))
    }, 100)

    const freshResult = await freshWait
    expect(freshResult.status).toBe('matched')
    expect(freshResult.history.at(-1)?.excerpt).toContain('DONE')
  })

  it('returns idle after terminal activity becomes stable', async () => {
    const sessionId = `session-${Date.now()}-idle`
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

    const wait = commandExecutor.waitForTerminalActivity(sessionId, {
      timeoutMs: 2000,
      idleMs: 250,
      requireFreshMatch: true
    })
    setTimeout(() => {
      commandExecutor.handleStreamOutput(sessionId, Buffer.from('rendered result'))
    }, 100)

    const result = await wait
    expect(result.status).toBe('idle')
    expect(result.snapshot.visibleText).toContain('rendered result')
    expect(result.history.length).toBeGreaterThan(0)
  })

  it('returns stable_output for readable multi-line TUI output', async () => {
    const sessionId = `session-${Date.now()}-stable-output`
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

    const wait = commandExecutor.waitForTerminalActivity(sessionId, {
      timeoutMs: 2000,
      idleMs: 250,
      requireFreshMatch: true
    })
    setTimeout(() => {
      commandExecutor.handleStreamOutput(
        sessionId,
        Buffer.from('Project analysis\r\napps/ - native apps\r\npackages/ - libraries')
      )
    }, 100)

    const result = await wait
    expect(result.status).toBe('stable_output')
    expect(result.screenPhase).toBe('stable_output')
  })

  it('returns an already stable screen after recent agent input without waiting for another change', async () => {
    const sessionId = `session-${Date.now()}-already-stable`
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

    await commandExecutor.sendAgentInput(sessionId, 'Enter', 'topic-1', 'key Enter')
    commandExecutor.handleStreamOutput(
      sessionId,
      Buffer.from('Project analysis\r\napps/ - native apps\r\npackages/ - libraries')
    )
    await commandExecutor.getTerminalSnapshot(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 30))

    const result = await commandExecutor.waitForTerminalActivity(sessionId, {
      timeoutMs: 1000,
      idleMs: 25,
      requireFreshMatch: true
    })

    expect(result.status).toBe('stable_output')
    expect(result.screenPhase).toBe('stable_output')
    expect(result.timedOut).toBe(false)
    expect(result.history.at(-1)?.excerpt).toContain('Project analysis')
  })

  it('classifies terminal screens for TUI phases', () => {
    const base = {
      sessionId: 's1',
      hostId: 'local',
      hostAlias: 'Local',
      cols: 80,
      rows: 4,
      cursorX: 0,
      cursorY: 3,
      bufferType: 'alternate' as const,
      viewportY: 0,
      baseY: 0,
      isLocked: false,
      lockedBy: null,
      isCommandRunning: false,
      updatedAt: Date.now(),
      lines: [
        { row: 0, text: 'Project analysis', wrapped: false },
        { row: 1, text: 'apps/ - native apps', wrapped: false },
        { row: 2, text: 'packages/ - libraries', wrapped: false },
        { row: 3, text: '', wrapped: false }
      ],
      visibleText: 'Project analysis\napps/ - native apps\npackages/ - libraries'
    }

    expect(classifyTerminalScreen(base)).toBe('stable_output')
    expect(
      classifyTerminalScreen({
        ...base,
        visibleText: 'Analyzing project... 34%',
        lines: [{ row: 0, text: 'Analyzing project... 34%', wrapped: false }]
      })
    ).toBe('running')
    expect(
      classifyTerminalScreen({
        ...base,
        visibleText: 'Ask anything',
        lines: [{ row: 0, text: 'Ask anything', wrapped: false }]
      })
    ).toBe('awaiting_input')
  })

  it('adds semantic fields to terminal snapshots for TUI automation', async () => {
    const sessionId = `session-${Date.now()}-snapshot-semantics`
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

    commandExecutor.handleStreamOutput(
      sessionId,
      Buffer.from('Choose an option\r\n> Install packages\r\n  Cancel')
    )

    const snapshot = await commandExecutor.getTerminalSnapshot(sessionId)

    expect(snapshot.visibleText).toContain('Choose an option')
    expect(snapshot.phase).toBe('awaiting_input')
    expect(snapshot.phaseConfidence).toBe('high')
    expect(snapshot.menuLike).toBe(true)
    expect(snapshot.selectedLineText).toContain('Install packages')
    expect(snapshot.inputHints).toContain('confirm_choice')
    expect(snapshot.nonEmptyLines).toContain('> Install packages')
    expect(snapshot.visibleTextHash).toMatch(/^[0-9a-f]{40}$/)
  })
})
