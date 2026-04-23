import { describe, expect, it } from 'vitest'
import type { AgentPart } from '../../../../shared/types'
import { shouldShowAgentLivePart } from '../agent-live-stream'

function part(overrides: Partial<AgentPart>): AgentPart {
  return {
    id: 'part-1',
    runId: 'run-1',
    type: 'tool',
    status: 'running',
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('agent live stream visibility', () => {
  it('hides internal usage and error parts from the live chat bubble', () => {
    expect(shouldShowAgentLivePart(part({ type: 'usage' }))).toBe(false)
    expect(shouldShowAgentLivePart(part({ type: 'error', status: 'error' }))).toBe(false)
  })

  it('keeps real tool progress and failures visible', () => {
    expect(
      shouldShowAgentLivePart(
        part({ type: 'tool', toolName: 'execute_command', status: 'running' })
      )
    ).toBe(true)
    expect(
      shouldShowAgentLivePart(
        part({ type: 'tool', toolName: 'execute_command', status: 'error', error: 'exit 1' })
      )
    ).toBe(true)
  })
})
