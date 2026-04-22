import { describe, expect, it } from 'vitest'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import { executeGrouped, groupByHost } from '../session-scheduler'

function call(id: string, hostId?: string): ChatCompletionMessageFunctionToolCall {
  return {
    id,
    type: 'function',
    function: {
      name: 'execute_command',
      arguments: JSON.stringify(hostId ? { hostId } : {})
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('session scheduler', () => {
  it('groups calls by host id', () => {
    const groups = groupByHost([call('a', 'h1'), call('b', 'h1'), call('c', 'h2'), call('d')])
    expect(groups.map((group) => [group.hostId, group.calls.map((item) => item.id)])).toEqual([
      ['h1', ['a', 'b']],
      ['h2', ['c']],
      [null, ['d']]
    ])
  })

  it('keeps same-host calls sequential', async () => {
    let running = 0
    let maxRunning = 0
    await executeGrouped([call('a', 'h1'), call('b', 'h1')], async (toolCall) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await delay(5)
      running -= 1
      return { toolCallId: toolCall.id, content: toolCall.id }
    })

    expect(maxRunning).toBe(1)
  })

  it('allows different-host calls to run in parallel', async () => {
    let running = 0
    let maxRunning = 0
    await executeGrouped([call('a', 'h1'), call('b', 'h2')], async (toolCall) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await delay(5)
      running -= 1
      return { toolCallId: toolCall.id, content: toolCall.id }
    })

    expect(maxRunning).toBe(2)
  })
})
