import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalBroker, APPROVAL_TIMEOUT_MS } from '../approval-broker'

function makeBroker(): ApprovalBroker {
  const broker = new ApprovalBroker()
  broker.setWebContents({ send: vi.fn() } as never)
  return broker
}

describe('ApprovalBroker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects pending approval requests after the default timeout', async () => {
    vi.useFakeTimers()
    const broker = makeBroker()
    const promise = broker.requestAuthorization('rm -rf demo', 'high', 'cleanup', {
      runId: 'run-1',
      taskId: 'task-1'
    })
    const assertion = expect(promise).rejects.toThrow('Approval request timed out')

    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS)
    await assertion
  })

  it('rejects only pending approvals that belong to the cancelled run tree', async () => {
    vi.useFakeTimers()
    const broker = makeBroker()
    const runOne = broker.requestAuthorization('danger-one', 'high', 'one', { runId: 'run-1' })
    const runTwo = broker.requestAuthorization('danger-two', 'high', 'two', { runId: 'run-2' })
    const runOneAssertion = expect(runOne).rejects.toThrow('Run was cancelled')

    broker.rejectRuns(['run-1'], 'Run was cancelled')
    await runOneAssertion

    const pendingIds = Array.from(
      (broker as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.keys()
    )
    expect(pendingIds).toHaveLength(1)

    await broker.handleAuthResponse(pendingIds[0], true, 'request')
    await expect(runTwo).resolves.toEqual({
      approved: true,
      alwaysAllow: false,
      scope: 'request'
    })
  })

  it('approves matching pending requests in the same turn when scope is turn', async () => {
    const broker = makeBroker()
    const first = broker.requestAuthorization('https://example.com/a', 'medium', 'fetch a', {
      topicId: 'topic-1',
      runId: 'run-1',
      taskId: 'task-1',
      turnId: 'run-1:1',
      permission: 'webfetch'
    })
    const second = broker.requestAuthorization('https://example.com/b', 'medium', 'fetch b', {
      topicId: 'topic-1',
      runId: 'run-1',
      taskId: 'task-1',
      turnId: 'run-1:1',
      permission: 'webfetch'
    })

    const requestId = (broker as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests
      .keys()
      .next().value as string
    await broker.handleAuthResponse(requestId, true, 'turn')

    await expect(first).resolves.toEqual({ approved: true, alwaysAllow: false, scope: 'turn' })
    await expect(second).resolves.toEqual({ approved: true, alwaysAllow: false, scope: 'turn' })
  })

  it('remembers topic-scoped approvals for later requests in the same topic', async () => {
    const broker = makeBroker()
    const first = broker.requestAuthorization('search one', 'medium', 'search', {
      topicId: 'topic-1',
      runId: 'run-1',
      taskId: 'task-1',
      turnId: 'run-1:1',
      permission: 'websearch'
    })
    const requestId = (broker as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests
      .keys()
      .next().value as string
    await broker.handleAuthResponse(requestId, true, 'topic')
    await expect(first).resolves.toEqual({ approved: true, alwaysAllow: true, scope: 'topic' })

    await expect(
      broker.requestAuthorization('search two', 'medium', 'search again', {
        topicId: 'topic-1',
        runId: 'run-2',
        taskId: 'task-2',
        turnId: 'run-2:1',
        permission: 'websearch'
      })
    ).resolves.toEqual({ approved: true, alwaysAllow: true, scope: 'topic' })

    expect(
      (broker as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size
    ).toBe(0)
  })
})
