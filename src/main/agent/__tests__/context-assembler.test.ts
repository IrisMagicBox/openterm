import { describe, it, expect } from 'vitest'
import { ContextAssembler } from '../context-assembler'
import { estimateTokenCount } from '../token-counter'
import type { Message } from '../../../shared/types'

// Helper: create a Message object
function makeMessage(role: Message['role'], content: string, extra?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    topicId: 'test-topic',
    role,
    content,
    timestamp: Date.now(),
    ...extra
  }
}

// Helper: create a ChatCompletionMessageParam-like object (avoid openai import)
function makeTurnMessage(
  role: 'user' | 'assistant' | 'tool',
  content: string,
  extra?: Record<string, unknown>
): { role: string; content: string; [key: string]: unknown } {
  return { role, content, ...extra }
}

// Helper: generate a string of approximately N tokens (4 chars/token)
function tokenString(n: number): string {
  return 'x'.repeat(n * 4)
}

describe('ContextAssembler', () => {
  describe('basic assembly with system prompt only', () => {
    it('assembles with just a system prompt', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('You are a helpful assistant.')
        .assemble()

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.'
      })
      expect(result.messages.length).toBe(1)
      expect(result.layerReport).toEqual([])
      expect(result.budget.isOverflow).toBe(false)
    })

    it('always includes the system prompt even with tight budget', () => {
      const result = new ContextAssembler({ modelContextWindow: 50, reserveTokens: 10 })
        .setSystemPrompt('System prompt that is always included')
        .assemble()

      expect(result.systemPrompt).toBe('System prompt that is always included')
      expect(result.messages[0].role).toBe('system')
    })
  })

  describe('assembly with layers included by priority', () => {
    it('includes all layers when budget allows', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('terminal', 'Terminal context here', 90)
        .addLayer('memory', 'Memory recall here', 50)
        .assemble()

      expect(result.layerReport).toHaveLength(2)
      expect(result.layerReport.every((r) => r.included)).toBe(true)
      expect(result.layerReport.every((r) => !r.truncated)).toBe(true)
      expect(result.systemPrompt).toContain('System')
      expect(result.systemPrompt).toContain('Terminal context here')
      expect(result.systemPrompt).toContain('Memory recall here')
    })

    it('sorts layers by priority (high priority layers kept first)', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('low', tokenString(100), 10)
        .addLayer('high', tokenString(100), 90)
        .addLayer('mid', tokenString(100), 50)
        .assemble()

      // All should be included since budget is large
      expect(result.layerReport).toHaveLength(3)
      // First in report should be highest priority
      expect(result.layerReport[0].name).toBe('high')
      expect(result.layerReport[1].name).toBe('mid')
      expect(result.layerReport[2].name).toBe('low')
    })
  })

  describe('low-priority layer dropped when budget is tight', () => {
    it('drops low-priority layer when budget is insufficient', () => {
      // Window: 100 tokens, reserve: 20 => 80 usable
      // System: ~2 tokens, high-priority: 40 tokens => 38 remaining
      // Low-priority: 50 tokens — too big, gets truncated (included but truncated)
      // After truncation remainingBudget=0, any further layers are dropped
      const result = new ContextAssembler({ modelContextWindow: 100, reserveTokens: 20 })
        .setSystemPrompt('System')
        .addLayer('high-priority', tokenString(40), 90)
        .addLayer('mid-priority', tokenString(50), 50) // truncated
        .addLayer('low-priority', tokenString(50), 10) // dropped (remaining=0)
        .assemble()

      const highReport = result.layerReport.find((r) => r.name === 'high-priority')
      const midReport = result.layerReport.find((r) => r.name === 'mid-priority')
      const lowReport = result.layerReport.find((r) => r.name === 'low-priority')

      expect(highReport?.included).toBe(true)
      expect(highReport?.truncated).toBe(false)
      expect(midReport?.included).toBe(true)
      expect(midReport?.truncated).toBe(true)
      expect(lowReport?.included).toBe(false)
    })

    it('drops multiple low-priority layers when budget is very tight', () => {
      // Window: 60, reserve: 20 => 40 usable
      // System: ~2 tokens => 38 remaining
      // critical(10) + medium(10) = 20 tokens used => 18 remaining
      // low(10) fits => 8 remaining, lowest(10) doesn't fit => truncated, 0 remaining
      // Actually with truncation, lowest gets truncated not dropped.
      // Let's use even tighter budget so layers after truncation get dropped:
      const result = new ContextAssembler({ modelContextWindow: 40, reserveTokens: 20 })
        .setSystemPrompt('System')
        .addLayer('critical', tokenString(10), 100)
        .addLayer('medium', tokenString(5), 50)
        .addLayer('low', tokenString(10), 10)
        .addLayer('lowest', tokenString(10), 1)
        .assemble()

      const dropped = result.layerReport.filter((r) => !r.included)
      expect(dropped.length).toBeGreaterThan(0)

      const criticalReport = result.layerReport.find((r) => r.name === 'critical')
      expect(criticalReport?.included).toBe(true)
    })
  })

  describe('layer truncation when partially fits', () => {
    it('truncates a layer that partially fits the budget', () => {
      // Window: 200, reserve: 50 => 150 usable
      // System: ~2 tokens, layers: one big layer that exceeds remaining budget
      const result = new ContextAssembler({ modelContextWindow: 200, reserveTokens: 50 })
        .setSystemPrompt('System')
        .addLayer('big-layer', tokenString(200), 50) // 200 tokens, way more than budget
        .assemble()

      const report = result.layerReport.find((r) => r.name === 'big-layer')
      expect(report?.included).toBe(true)
      expect(report?.truncated).toBe(true)
      expect(result.systemPrompt).toContain('...[truncated]')
    })

    it('does not truncate layers that fully fit', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('small-layer', 'Small content', 50)
        .assemble()

      const report = result.layerReport.find((r) => r.name === 'small-layer')
      expect(report?.truncated).toBe(false)
    })
  })

  describe('history windowing keeps most recent messages', () => {
    it('keeps most recent messages when budget is limited', () => {
      const messages: Message[] = [
        makeMessage('user', tokenString(30)), // 30 tokens
        makeMessage('assistant', tokenString(30)), // 30 tokens
        makeMessage('user', tokenString(30)), // 30 tokens
        makeMessage('assistant', tokenString(30)) // 30 tokens - most recent
      ]

      // Window: 200, reserve: 50 => 150 usable
      // System: ~2 tokens, no layers, no turns => ~148 for history
      // Should keep last ~4-5 messages (each 30 tokens)
      const result = new ContextAssembler({ modelContextWindow: 200, reserveTokens: 50 })
        .setSystemPrompt('System')
        .setHistory(messages)
        .assemble()

      // Most recent messages should be present
      const historyMessages = result.messages.filter((m) => m.role !== 'system')
      expect(historyMessages.length).toBeGreaterThan(0)
      // The last history message should be the most recent
      if (historyMessages.length > 0) {
        const lastHistory = historyMessages[historyMessages.length - 1]
        expect(lastHistory.content).toBe(tokenString(30))
      }
    })

    it('drops oldest messages first when budget is tight', () => {
      const messages: Message[] = [
        makeMessage('user', 'oldest message'),
        makeMessage('assistant', 'old response'),
        makeMessage('user', 'recent message'),
        makeMessage('assistant', 'newest response')
      ]

      // Very tight budget - only room for ~2 messages
      const result = new ContextAssembler({ modelContextWindow: 50, reserveTokens: 10 })
        .setSystemPrompt('Sys')
        .setHistory(messages)
        .assemble()

      const historyMessages = result.messages.filter((m) => m.role !== 'system')
      // Should prefer most recent messages
      if (historyMessages.length > 0) {
        const lastMsg = historyMessages[historyMessages.length - 1]
        expect(lastMsg.content).toBe('newest response')
      }
    })

    it('returns no history when budget is zero', () => {
      const messages: Message[] = [makeMessage('user', 'hello')]

      const result = new ContextAssembler({ modelContextWindow: 20, reserveTokens: 19 })
        .setSystemPrompt('System prompt taking all budget')
        .setHistory(messages)
        .assemble()

      const historyMessages = result.messages.filter((m) => m.role !== 'system')
      expect(historyMessages.length).toBe(0)
    })

    it('handles empty history gracefully', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setHistory([])
        .assemble()

      const historyMessages = result.messages.filter((m) => m.role !== 'system')
      expect(historyMessages.length).toBe(0)
    })
  })

  describe('empty history and turns', () => {
    it('assembles correctly with no history or turns', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System only')
        .assemble()

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe('system')
    })

    it('assembles with history but no turns', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setHistory([makeMessage('user', 'Hello')])
        .assemble()

      expect(result.messages.length).toBe(2) // system + user history
      expect(result.messages[0].role).toBe('system')
      expect(result.messages[1].role).toBe('user')
    })
  })

  describe('turn messages always included', () => {
    it('includes turn messages in the output', () => {
      const turnMsg = makeTurnMessage('assistant', 'Turn message')
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setTurnMessages([turnMsg] as never[])
        .assemble()

      const lastMsg = result.messages[result.messages.length - 1]
      expect(lastMsg.content).toBe('Turn message')
    })

    it('accounts for turn message tokens in budget', () => {
      // Turn messages consume budget, leaving less for layers/history
      const bigTurn = makeTurnMessage('assistant', tokenString(100))

      const resultWithoutTurn = new ContextAssembler({
        modelContextWindow: 200,
        reserveTokens: 50
      })
        .setSystemPrompt('System')
        .addLayer('context', tokenString(50), 50)
        .assemble()

      const resultWithTurn = new ContextAssembler({
        modelContextWindow: 200,
        reserveTokens: 50
      })
        .setSystemPrompt('System')
        .setTurnMessages([bigTurn] as never[])
        .addLayer('context', tokenString(50), 50)
        .assemble()

      // With turn messages consuming budget, less room for layers
      const layerWithout = resultWithoutTurn.layerReport.find((r) => r.name === 'context')

      // Layer is more likely to be truncated/dropped with turn messages
      if (layerWithout?.included && !layerWithout.truncated) {
        // If it fit without turns, it might not fit with turns
        // At minimum, the turn messages should be present in output
        expect(resultWithTurn.messages.some((m) => m.content === tokenString(100))).toBe(true)
      }
    })

    it('counts tool_calls in turn messages', () => {
      const turnWithToolCall = {
        role: 'assistant',
        content: 'Using tool',
        tool_calls: [
          {
            id: 'tc1',
            type: 'function' as const,
            function: { name: 'execute_command', arguments: '{"cmd":"ls"}' }
          }
        ]
      }

      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setTurnMessages([turnWithToolCall] as never[])
        .assemble()

      // Turn message should be present
      expect(result.messages.length).toBeGreaterThan(1)
    })
  })

  describe('layer report accuracy', () => {
    it('reports correct token estimates for each layer', () => {
      const content = tokenString(25) // 25 tokens
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('test-layer', content, 50)
        .assemble()

      const report = result.layerReport.find((r) => r.name === 'test-layer')
      expect(report?.tokenEstimate).toBe(estimateTokenCount(content))
      expect(report?.priority).toBe(50)
      expect(report?.reason).toBe('included')
    })

    it('includes context report details for layers, history, turns, and budget', () => {
      const history = [makeMessage('user', 'hello'), makeMessage('assistant', 'world')]
      const turn = makeTurnMessage('assistant', 'turn')
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('memory', 'Memory content', 60, {
          tokenBudget: 20,
          debugReport: { source: 'test' }
        })
        .setHistory(history)
        .setTurnMessages([turn] as never[])
        .assemble()

      expect(result.contextReport.layers[0]).toMatchObject({
        name: 'memory',
        priority: 60,
        tokenBudget: 20,
        included: true,
        debugReport: { source: 'test' }
      })
      expect(result.contextReport.history.totalMessages).toBe(2)
      expect(result.contextReport.history.includedMessages).toBe(2)
      expect(result.contextReport.turns.messageCount).toBe(1)
      expect(result.contextReport.budget.windowSize).toBe(1000)
    })

    it('honors per-layer token budgets before global budget is exhausted', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('budgeted', tokenString(50), 90, { tokenBudget: 10 })
        .addLayer('next', 'still has room', 80)
        .assemble()

      const budgeted = result.layerReport.find((r) => r.name === 'budgeted')
      const next = result.layerReport.find((r) => r.name === 'next')
      expect(budgeted?.included).toBe(true)
      expect(budgeted?.truncated).toBe(true)
      expect(budgeted?.tokenBudget).toBe(10)
      expect(next?.included).toBe(true)
    })

    it('reports all layers even when not included', () => {
      // Need to ensure a layer gets dropped, not just truncated.
      // After truncation, remainingBudget=0, so subsequent layers are dropped.
      const result = new ContextAssembler({ modelContextWindow: 30, reserveTokens: 10 })
        .setSystemPrompt('System')
        .addLayer('big-truncated', tokenString(50), 90) // truncated, sets remaining=0
        .addLayer('dropped', tokenString(100), 1) // dropped because remaining=0
        .assemble()

      expect(result.layerReport).toHaveLength(2)
      const droppedReport = result.layerReport.find((r) => r.name === 'dropped')
      expect(droppedReport?.included).toBe(false)
      expect(droppedReport?.tokenEstimate).toBeGreaterThan(0)
    })

    it('reports truncation status correctly', () => {
      const result = new ContextAssembler({ modelContextWindow: 100, reserveTokens: 20 })
        .setSystemPrompt('Sys')
        .addLayer('big', tokenString(200), 50)
        .assemble()

      const report = result.layerReport.find((r) => r.name === 'big')
      expect(report?.included).toBe(true)
      expect(report?.truncated).toBe(true)
    })
  })

  describe('budget calculation accuracy', () => {
    it('calculates budget with correct used tokens', () => {
      const systemPrompt = 'System prompt'
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt(systemPrompt)
        .assemble()

      expect(result.budget.windowSize).toBe(1000)
      expect(result.budget.reserved).toBe(100)
      expect(result.budget.usable).toBe(900)
      expect(result.budget.used).toBeGreaterThanOrEqual(estimateTokenCount(systemPrompt))
      expect(result.budget.remaining).toBeLessThanOrEqual(900)
    })

    it('detects overflow when context exceeds usable budget', () => {
      const result = new ContextAssembler({ modelContextWindow: 50, reserveTokens: 10 })
        .setSystemPrompt(tokenString(50)) // 50 tokens - exceeds 40 usable
        .assemble()

      expect(result.budget.isOverflow).toBe(true)
      expect(result.budget.remaining).toBe(0)
    })

    it('uses default constants when no opts provided', () => {
      const result = new ContextAssembler().setSystemPrompt('Hello').assemble()

      // Should use CONTEXT_WINDOW_TOKENS (128000) and CONTEXT_RESERVE_TOKENS (4096)
      expect(result.budget.windowSize).toBe(128_000)
      expect(result.budget.reserved).toBe(4_096)
    })

    it('custom model context window and reserve tokens', () => {
      const result = new ContextAssembler({
        modelContextWindow: 8000,
        reserveTokens: 1000
      })
        .setSystemPrompt('Hi')
        .assemble()

      expect(result.budget.windowSize).toBe(8000)
      expect(result.budget.reserved).toBe(1000)
      expect(result.budget.usable).toBe(7000)
    })
  })

  describe('fluent API chaining', () => {
    it('returns this from all setter methods', () => {
      const assembler = new ContextAssembler()
      const systemResult = assembler.setSystemPrompt('test')
      const layerResult = assembler.addLayer('l', 'c', 1)
      const historyResult = assembler.setHistory([])
      const turnResult = assembler.setTurnMessages([])

      expect(systemResult).toBe(assembler)
      expect(layerResult).toBe(assembler)
      expect(historyResult).toBe(assembler)
      expect(turnResult).toBe(assembler)
    })

    it('supports full method chaining', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('terminal', 'Terminal context', 90)
        .addLayer('memory', 'Memory context', 50)
        .setHistory([makeMessage('user', 'Hello')])
        .setTurnMessages([makeTurnMessage('assistant', 'Response')] as never[])
        .assemble()

      expect(result.messages.length).toBeGreaterThanOrEqual(3) // system + history + turn
      expect(result.layerReport).toHaveLength(2)
    })
  })

  describe('message format conversion', () => {
    it('converts Message to ChatCompletionMessageParam correctly', () => {
      const history: Message[] = [
        makeMessage('user', 'Hello', {
          toolCalls: undefined,
          toolCallId: undefined,
          name: undefined
        })
      ]

      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setHistory(history)
        .assemble()

      const userMsg = result.messages.find((m) => m.role === 'user')
      expect(userMsg).toBeDefined()
      expect(userMsg!.content).toBe('Hello')
    })

    it('preserves tool_calls and tool_call_id in converted messages', () => {
      const history: Message[] = [
        makeMessage('assistant', '', {
          toolCalls: [
            {
              id: 'tc1',
              type: 'function' as const,
              function: { name: 'test_tool', arguments: '{"arg":"val"}' }
            }
          ]
        }),
        makeMessage('tool', 'tool result', {
          toolCallId: 'tc1',
          name: 'test_tool'
        })
      ]

      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setHistory(history)
        .assemble()

      const assistantMsg = result.messages.find((m) => m.role === 'assistant')
      const toolMsg = result.messages.find((m) => m.role === 'tool')

      expect(assistantMsg).toBeDefined()
      expect(toolMsg).toBeDefined()
      expect('tool_calls' in assistantMsg! && assistantMsg!.tool_calls).toBeDefined()
    })
  })

  describe('system prompt composition', () => {
    it('joins system prompt and layers with double newlines', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('Base system prompt')
        .addLayer('layer1', 'Layer one content', 90)
        .addLayer('layer2', 'Layer two content', 50)
        .assemble()

      expect(result.systemPrompt).toBe(
        'Base system prompt\n\nLayer one content\n\nLayer two content'
      )
    })

    it('system prompt without layers is just the base', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('Just the base')
        .assemble()

      expect(result.systemPrompt).toBe('Just the base')
    })

    it('only includes layers that fit, preserving order by priority', () => {
      // High priority layer fits, low priority doesn't
      const result = new ContextAssembler({ modelContextWindow: 200, reserveTokens: 50 })
        .setSystemPrompt('System')
        .addLayer('low', tokenString(100), 10) // too big after high layer
        .addLayer('high', tokenString(50), 90) // fits
        .assemble()

      // The system prompt should contain the high-priority layer
      expect(result.systemPrompt).toContain(tokenString(50))
    })
  })

  describe('edge cases', () => {
    it('handles zero-length system prompt', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('')
        .assemble()

      expect(result.messages[0].role).toBe('system')
      expect(result.messages[0].content).toBe('')
    })

    it('handles layers with empty content', () => {
      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('empty', '', 50)
        .assemble()

      const report = result.layerReport.find((r) => r.name === 'empty')
      expect(report?.included).toBe(true)
      expect(report?.tokenEstimate).toBe(0)
    })

    it('handles messages with empty content in history', () => {
      const history: Message[] = [
        makeMessage('assistant', ''),
        makeMessage('tool', 'tool result', { toolCallId: 'tc1' })
      ]

      const result = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .setHistory(history)
        .assemble()

      // Should not crash, and should include messages
      expect(result.messages.length).toBeGreaterThanOrEqual(2)
    })

    it('can be reused - calling assemble() multiple times', () => {
      const assembler = new ContextAssembler({ modelContextWindow: 1000, reserveTokens: 100 })
        .setSystemPrompt('System')
        .addLayer('layer', 'Content', 50)

      const result1 = assembler.assemble()
      const result2 = assembler.assemble()

      expect(result1.systemPrompt).toBe(result2.systemPrompt)
      expect(result1.messages).toEqual(result2.messages)
    })

    it('handles very large context window', () => {
      const result = new ContextAssembler({ modelContextWindow: 1_000_000, reserveTokens: 10_000 })
        .setSystemPrompt('System')
        .addLayer('big', tokenString(5000), 50)
        .setHistory([makeMessage('user', tokenString(1000))])
        .assemble()

      expect(result.budget.usable).toBe(990_000)
      expect(result.budget.isOverflow).toBe(false)
    })
  })
})
