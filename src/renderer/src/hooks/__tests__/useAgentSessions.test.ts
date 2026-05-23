import { describe, expect, it } from 'vitest'
import { enqueuePendingAuth, removePendingAuth } from '../useAgentSessions'

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
})
