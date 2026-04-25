import { describe, expect, it } from 'vitest'
import type { Host, TerminalSession } from '../../../../shared/types'
import {
  shouldMirrorSessionInTerminalTabs,
  terminalTabFromSession,
  upsertTerminalTab
} from '../terminal-tabs'

const remoteHost: Host = {
  id: 'host-1',
  alias: 'remote',
  ip: '10.0.0.5',
  port: 22,
  username: 'root',
  tags: [],
  createdAt: 1
}

function session(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'session-1',
    topicId: 'topic-1',
    hostId: 'host-1',
    hostAlias: 'remote',
    role: 'user',
    status: 'active',
    shellIntegrationReady: false,
    createdAt: 2,
    ...overrides
  }
}

describe('terminal tab helpers', () => {
  it('mirrors visible user and interactive sessions', () => {
    expect(shouldMirrorSessionInTerminalTabs(session({ role: 'user' }))).toBe(true)
    expect(shouldMirrorSessionInTerminalTabs(session({ role: 'interactive' }))).toBe(true)
  })

  it('does not mirror hidden or agent command sessions', () => {
    expect(shouldMirrorSessionInTerminalTabs(session({ role: 'agent_command' }))).toBe(false)
    expect(shouldMirrorSessionInTerminalTabs(session({ visible: false }))).toBe(false)
  })

  it('builds a tab from a known host session', () => {
    expect(terminalTabFromSession(session({ name: 'work' }), [remoteHost])).toEqual({
      host: remoteHost,
      sessionId: 'session-1',
      title: 'work'
    })
  })

  it('upserts existing tabs by session id', () => {
    const next = upsertTerminalTab([{ host: remoteHost, sessionId: 'session-1', title: 'old' }], {
      host: remoteHost,
      sessionId: 'session-1',
      title: 'new'
    })

    expect(next).toEqual([{ host: remoteHost, sessionId: 'session-1', title: 'new' }])
  })
})
