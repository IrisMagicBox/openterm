import { describe, expect, it } from 'vitest'
import type { Message } from '../../../../shared/types'
import { isTerminalAgentStep } from '../useChatMessages'

function step(agentStatus: NonNullable<Message['metadata']>['agentStatus']): Message {
  return {
    id: `step-${agentStatus}`,
    topicId: 'topic-1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    metadata: { agentStatus }
  }
}

describe('useChatMessages helpers', () => {
  it('treats done, error, and cancelled assistant steps as terminal', () => {
    expect(isTerminalAgentStep(step('done'))).toBe(true)
    expect(isTerminalAgentStep(step('error'))).toBe(true)
    expect(isTerminalAgentStep(step('cancelled'))).toBe(true)
    expect(isTerminalAgentStep(step('thinking'))).toBe(false)
  })

  it('does not treat non-assistant steps as terminal', () => {
    expect(
      isTerminalAgentStep({
        ...step('cancelled'),
        role: 'user'
      })
    ).toBe(false)
  })
})
