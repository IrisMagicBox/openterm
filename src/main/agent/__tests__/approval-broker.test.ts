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

    await broker.handleAuthResponse(
      (broker as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.keys().next()
        .value as string,
      true,
      false
    )
    await expect(runTwo).resolves.toEqual({ approved: true, alwaysAllow: false })
  })
})
