import { describe, expect, it } from 'vitest'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions'
import { ToolCallLedger } from '../tool-call-ledger'

function call(
  id: string,
  args: Record<string, unknown>,
  name = 'execute_command'
): ChatCompletionMessageFunctionToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  }
}

describe('ToolCallLedger', () => {
  it('canonicalizes execute_command without reason', () => {
    const first = ToolCallLedger.signatureFor('execute_command', {
      hostId: 'h1',
      command: 'pwd',
      reason: 'first reason'
    })
    const second = ToolCallLedger.signatureFor('execute_command', {
      hostId: 'h1',
      command: 'pwd',
      reason: 'second reason'
    })

    expect(first).toBe(second)
  })

  it('records repeated batch attempts without blocking them', () => {
    const ledger = new ToolCallLedger()
    const batch = (suffix: string) => {
      const tailArgs = { hostId: 'h1', command: 'tail log', reason: suffix }
      const logsArgs = { hostId: 'h1', command: 'kubectl logs', reason: suffix }
      return [
        { call: call(`a-${suffix}`, tailArgs), args: tailArgs },
        { call: call(`b-${suffix}`, logsArgs), args: logsArgs }
      ]
    }

    expect(ledger.registerAttempts(batch('1'), 1)).toHaveLength(2)
    expect(ledger.registerAttempts(batch('2'), 2)).toHaveLength(2)
    const third = ledger.registerAttempts(batch('3'), 3)

    expect(third).toHaveLength(2)
    expect(third.map((attempt) => attempt.count)).toEqual([3, 3])
    expect(ledger.snapshot().map((entry) => entry.repeatCount)).toEqual([2, 2])
  })

  it('marks repeated identical output as diagnostics only', () => {
    const ledger = new ToolCallLedger()
    const makeAttempt = (id: string) => ({
      call: call(id, { hostId: 'h1', command: 'pwd' }),
      args: { hostId: 'h1', command: 'pwd' }
    })

    ledger.registerAttempts([makeAttempt('a')], 1)
    ledger.recordObservation('execute_command', { hostId: 'h1', command: 'pwd' }, 'same output')
    ledger.registerAttempts([makeAttempt('b')], 2)
    ledger.recordObservation('execute_command', { hostId: 'h1', command: 'pwd' }, 'same output')
    const [third] = ledger.registerAttempts([makeAttempt('c')], 3)

    expect(third.count).toBe(3)
    expect(third.entry.lastOutputRepeated).toBe(true)
    expect(third.entry.lastStatus).toBe('pending')
  })

  it('records timeout status but keeps later identical attempts executable', () => {
    const ledger = new ToolCallLedger()
    const attempt = (id: string) => ({
      call: call(id, { hostId: 'h1', command: 'slow command' }),
      args: { hostId: 'h1', command: 'slow command' }
    })

    ledger.registerAttempts([attempt('a')], 1)
    ledger.recordObservation(
      'execute_command',
      { hostId: 'h1', command: 'slow command' },
      'Exit: -1 | Duration: 60000ms'
    )
    ledger.registerAttempts([attempt('b')], 2)
    const [third] = ledger.registerAttempts([attempt('c')], 3)

    expect(third.count).toBe(3)
    expect(third.entry.lastStatus).toBe('pending')
    expect(third.entry.lastObservation).toContain('Exit: -1')
  })
})
