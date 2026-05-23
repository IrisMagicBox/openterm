import { describe, expect, it } from 'vitest'
import { enqueuePendingAuth, removePendingAuth, removeResolvedPendingAuth } from '../useAgentSessions'

describe('useAgentSessions pending auth queue helpers', () => {
  it('keeps concurrent approval requests in FIFO order', () => {
    const queue = enqueuePendingAuth(
      enqueuePendingAuth([], {
        requestId: 'request-1',
        command: 'first'
      }),
      {
        requestId: 'request-2',
        command: 'second'
      }
    )

    expect(queue.map((item) => item.requestId)).toEqual(['request-1', 'request-2'])
  })

  it('deduplicates repeated approval request events by request id', () => {
    const request = { requestId: 'request-1', command: 'first' }
    const queue = enqueuePendingAuth(enqueuePendingAuth([], request), request)

    expect(queue).toEqual([request])
  })

  it('removes the resolved request while preserving later approvals', () => {
    const queue = [
      { requestId: 'request-1', command: 'first' },
      { requestId: 'request-2', command: 'second' }
    ]

    expect(removePendingAuth(queue, 'request-1').map((item) => item.requestId)).toEqual([
      'request-2'
    ])
  })

  it('removes same-turn matching approvals after approving for the current turn', () => {
    const queue = [
      {
        requestId: 'request-1',
        command: 'first',
        riskLevel: 'medium',
        metadata: {
          topicId: 'topic-1',
          runId: 'run-1',
          turnId: 'run-1:1',
          permission: 'webfetch'
        }
      },
      {
        requestId: 'request-2',
        command: 'second',
        riskLevel: 'medium',
        metadata: {
          topicId: 'topic-1',
          runId: 'run-1',
          turnId: 'run-1:1',
          permission: 'webfetch'
        }
      },
      {
        requestId: 'request-3',
        command: 'third',
        riskLevel: 'medium',
        metadata: {
          topicId: 'topic-1',
          runId: 'run-1',
          turnId: 'run-1:2',
          permission: 'webfetch'
        }
      }
    ]

    expect(
      removeResolvedPendingAuth(queue, 'request-1', true, 'turn').map((item) => item.requestId)
    ).toEqual(['request-3'])
  })

  it('removes same-topic matching approvals after approving for the conversation', () => {
    const queue = [
      {
        requestId: 'request-1',
        command: 'first',
        riskLevel: 'medium',
        metadata: { topicId: 'topic-1', runId: 'run-1', turnId: 'run-1:1', permission: 'webfetch' }
      },
      {
        requestId: 'request-2',
        command: 'second',
        riskLevel: 'low',
        metadata: { topicId: 'topic-1', runId: 'run-2', turnId: 'run-2:1', permission: 'webfetch' }
      },
      {
        requestId: 'request-3',
        command: 'third',
        riskLevel: 'medium',
        metadata: { topicId: 'topic-2', runId: 'run-3', turnId: 'run-3:1', permission: 'webfetch' }
      },
      {
        requestId: 'request-4',
        command: 'fourth',
        riskLevel: 'medium',
        metadata: { topicId: 'topic-1', runId: 'run-4', turnId: 'run-4:1', permission: 'websearch' }
      }
    ]

    expect(
      removeResolvedPendingAuth(queue, 'request-1', true, 'topic').map((item) => item.requestId)
    ).toEqual(['request-3', 'request-4'])
  })
})
