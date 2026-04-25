import { describe, expect, it } from 'vitest'
import { shouldDispatchQueuedMessage } from '../chat-message-queue'

describe('shouldDispatchQueuedMessage', () => {
  it('dispatches when idle and queue has messages', () => {
    expect(
      shouldDispatchQueuedMessage({
        thinking: false,
        queuedSendInFlight: false,
        queueLength: 1
      })
    ).toBe(true)
  })

  it('does not dispatch while thinking', () => {
    expect(
      shouldDispatchQueuedMessage({
        thinking: true,
        queuedSendInFlight: false,
        queueLength: 1
      })
    ).toBe(false)
  })

  it('does not dispatch while a queued send is in flight', () => {
    expect(
      shouldDispatchQueuedMessage({
        thinking: false,
        queuedSendInFlight: true,
        queueLength: 1
      })
    ).toBe(false)
  })

  it('does not dispatch an empty queue', () => {
    expect(
      shouldDispatchQueuedMessage({
        thinking: false,
        queuedSendInFlight: false,
        queueLength: 0
      })
    ).toBe(false)
  })
})
