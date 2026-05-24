import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSession } from '../../../shared/types'

const mocks = vi.hoisted(() => ({
  commandExecutor: {
    closeSession: vi.fn(),
    getSessionControlState: vi.fn(() => undefined),
    canAcceptAgentCommand: vi.fn(() => ({ ok: true })),
    isSessionLocked: vi.fn(() => ({ locked: false, lockedBy: null }))
  },
  terminalSessionDB: {
    getSessionById: vi.fn(),
    updateSessionVisibility: vi.fn(),
    updateSessionName: vi.fn(),
    updateSessionPinned: vi.fn()
  },
  hostDB: {
    getHostById: vi.fn()
  },
  memoryDB: {
    searchMemories: vi.fn()
  },
  topicDB: {
    getTopicById: vi.fn(),
    updateTopicHosts: vi.fn()
  }
}))

vi.mock('../../terminal', () => ({
  commandExecutor: mocks.commandExecutor
}))

vi.mock('../../db', () => ({
  hostDB: mocks.hostDB,
  memoryDB: mocks.memoryDB,
  terminalSessionDB: mocks.terminalSessionDB,
  topicDB: mocks.topicDB
}))

vi.mock('../../local-terminal', () => ({
  createLocalSession: vi.fn()
}))

import { AgentSessionManager } from '../agent-session-manager'

function session(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'session-1',
    topicId: 'topic-1',
    hostId: 'host-1',
    hostAlias: 'remote',
    role: 'user',
    status: 'active',
    shellIntegrationReady: false,
    createdAt: 1,
    visible: true,
    ...overrides
  }
}

describe('AgentSessionManager session lifecycle notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes a system-closed session without issuing another physical close', async () => {
    const manager = new AgentSessionManager()
    const send = vi.fn()
    manager.setWebContents({ send } as never)
    await manager.registerSession({ ...session(), paused: false })

    manager.notifySessionClosed('session-1')

    expect(mocks.commandExecutor.closeSession).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('agent:session-closed', { id: 'session-1' })
    await expect(manager.getSessions('topic-1')).resolves.toEqual([])
  })

  it('keeps explicit user close as the only path that physically closes a session', async () => {
    const manager = new AgentSessionManager()
    const physicalClose = vi.fn(() => true)
    manager.setWebContents({ send: vi.fn() } as never)
    manager.setCloseTerminalSession(physicalClose)
    await manager.registerSession({ ...session(), paused: false })

    await manager.closeTerminal('session-1', { deletedBy: 'user' })

    expect(physicalClose).toHaveBeenCalledWith(
      { id: 'session-1', hostId: 'host-1' },
      'user'
    )
    expect(mocks.commandExecutor.closeSession).not.toHaveBeenCalled()
  })
})
