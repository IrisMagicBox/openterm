import { describe, expect, it } from 'vitest'
import type { AgentPart, TerminalSession } from '../../../../shared/types'
import {
  deriveTerminalActivities,
  pickFollowAgentSession,
  resolveFocusedSessionId,
  sortTerminalActivities,
  type TerminalActivity,
  type TerminalPreview
} from '../terminal-stage'

function session(id: string, overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id,
    topicId: 'topic-1',
    hostId: id === 'local' ? 'local' : `host-${id}`,
    hostAlias: `host-${id}`,
    status: 'active',
    shellIntegrationReady: true,
    visible: true,
    createdAt: 100,
    ...overrides
  }
}

function part(id: string, overrides: Partial<AgentPart> = {}): AgentPart {
  return {
    id,
    runId: 'run-1',
    type: 'tool',
    status: 'running',
    toolName: 'shell',
    sessionId: 's1',
    input: '{"command":"npm test"}',
    orderIndex: 0,
    createdAt: 100,
    updatedAt: 100,
    ...overrides
  }
}

describe('terminal stage helpers', () => {
  it('derives terminal activity from sessions, parts, and previews', () => {
    const previews: Record<string, TerminalPreview> = {
      s1: { sessionId: 's1', lastLine: 'running tests', updatedAt: 1600 }
    }

    const activities = deriveTerminalActivities(
      [
        session('s1', {
          commandStatus: 'running',
          command: 'npm run typecheck',
          commandStartTime: 1000
        }),
        session('s2', {
          commandStatus: 'failed',
          command: 'npm run build',
          commandExitCode: 1,
          commandDurationMs: 320
        }),
        session('s3', { paused: true })
      ],
      [part('part-1', { sessionId: 's1', updatedAt: 1500 })],
      previews,
      2500
    )

    expect(activities.find((activity) => activity.sessionId === 's1')).toMatchObject({
      status: 'running',
      command: 'npm run typecheck',
      lastLine: 'running tests',
      durationMs: 1500,
      partId: 'part-1',
      toolName: 'shell'
    })
    expect(activities.find((activity) => activity.sessionId === 's2')).toMatchObject({
      status: 'failed',
      exitCode: 1,
      durationMs: 320
    })
    expect(activities.find((activity) => activity.sessionId === 's3')).toMatchObject({
      status: 'paused'
    })
  })

  it('treats automatic takeover as non-paused activity while keeping manual pause distinct', () => {
    const activities = deriveTerminalActivities(
      [
        session('s-auto', {
          lockedBy: 'user',
          takeoverMode: 'auto',
          paused: false
        }),
        session('s-manual', {
          lockedBy: 'user',
          takeoverMode: 'manual',
          paused: true
        })
      ],
      [],
      {}
    )

    expect(activities.find((activity) => activity.sessionId === 's-auto')).toMatchObject({
      status: 'idle'
    })
    expect(activities.find((activity) => activity.sessionId === 's-manual')).toMatchObject({
      status: 'paused'
    })
  })

  it('sorts by activity without moving the focused terminal', () => {
    const activities: TerminalActivity[] = [
      { sessionId: 'idle', hostAlias: 'idle', status: 'idle', updatedAt: 400 },
      { sessionId: 'focused', hostAlias: 'focused', status: 'idle', updatedAt: 100 },
      { sessionId: 'completed', hostAlias: 'completed', status: 'completed', updatedAt: 50 },
      { sessionId: 'failed', hostAlias: 'failed', status: 'failed', updatedAt: 200 },
      { sessionId: 'running', hostAlias: 'running', status: 'running', updatedAt: 50 }
    ]

    expect(sortTerminalActivities(activities).map((activity) => activity.sessionId)).toEqual([
      'running',
      'failed',
      'completed',
      'idle',
      'focused'
    ])
  })

  it('follows the latest running command or associated agent part', () => {
    const sessions = [
      session('s1', { commandStatus: 'running', commandStartTime: 1000 }),
      session('s2')
    ]

    expect(
      pickFollowAgentSession(sessions, [part('part-2', { sessionId: 's2', updatedAt: 1500 })])
    ).toBe('s2')
  })

  it('does not steal focus when follow agent is disabled and recovers after close', () => {
    const sessions = [
      session('s1', { commandStatus: 'running', commandStartTime: 1000 }),
      session('s2')
    ]

    expect(
      resolveFocusedSessionId({
        sessions,
        activeParts: [],
        currentFocusedSessionId: 's2',
        followAgent: false
      })
    ).toBe('s2')

    expect(
      resolveFocusedSessionId({
        sessions: [sessions[0]],
        activeParts: [],
        currentFocusedSessionId: 's2',
        followAgent: false
      })
    ).toBe('s1')
  })
})
