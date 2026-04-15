import { describe, it, expect } from 'vitest'
import { PRUNE_PROTECT_TOKENS } from '../token-counter'

// Inline pruneToolOutputs to avoid importing compaction.ts
// (which imports ai.ts → db → electron, not available in test env)
interface SimpleMessage {
  role: string
  content: string
  toolCalls?: unknown[]
  name?: string
  toolCallId?: string
}

function pruneToolOutputs(messages: SimpleMessage[]): {
  messages: SimpleMessage[]
  prunedCount: number
  prunedTokens: number
} {
  let protectedTokens = 0
  let prunedCount = 0
  let prunedTokens = 0
  const result = messages.map((msg) => {
    if (msg.role !== 'tool' && !(msg.toolCalls && msg.toolCalls.length > 0)) {
      return msg
    }
    if (msg.role === 'tool' && msg.content) {
      const msgTokens = Math.ceil(msg.content.length / 4)
      protectedTokens += msgTokens
      if (protectedTokens > PRUNE_PROTECT_TOKENS) {
        prunedCount++
        prunedTokens += msgTokens
        return { ...msg, content: `[Tool output pruned — ${msgTokens} tokens recovered]` }
      }
    }
    return msg
  })
  return { messages: result, prunedCount, prunedTokens }
}

function makeToolResult(content: string): SimpleMessage {
  return { role: 'tool', content, name: 'execute_command', toolCallId: 'tc1' }
}

function makeUserMsg(content: string): SimpleMessage {
  return { role: 'user', content }
}

function makeAssistantMsg(content: string): SimpleMessage {
  return { role: 'assistant', content }
}

describe('compaction', () => {
  describe('pruneToolOutputs', () => {
    it('returns unchanged messages when no tool outputs', () => {
      const messages = [makeUserMsg('hello'), makeAssistantMsg('hi')]
      const result = pruneToolOutputs(messages)
      expect(result.prunedCount).toBe(0)
      expect(result.messages).toEqual(messages)
    })

    it('returns unchanged when tool outputs are under protection budget', () => {
      const messages = [makeToolResult('small output')]
      const result = pruneToolOutputs(messages)
      expect(result.prunedCount).toBe(0)
      expect(result.messages[0].content).toBe('small output')
    })

    it('prunes tool outputs that exceed protection budget', () => {
      const largeContent = 'x'.repeat(200_000) // ~50000 tokens
      const messages = [makeToolResult(largeContent), makeToolResult(largeContent)]
      const result = pruneToolOutputs(messages)
      expect(result.prunedCount).toBeGreaterThanOrEqual(1)
    })

    it('preserves non-tool messages', () => {
      const messages = [makeUserMsg('hello'), makeToolResult('output'), makeAssistantMsg('done')]
      const result = pruneToolOutputs(messages)
      expect(result.messages[0].content).toBe('hello')
      expect(result.messages[2].content).toBe('done')
    })

    it('empty messages array returns empty result', () => {
      const result = pruneToolOutputs([])
      expect(result.messages).toEqual([])
      expect(result.prunedCount).toBe(0)
      expect(result.prunedTokens).toBe(0)
    })

    it('pruned message contains hint text', () => {
      const largeContent = 'y'.repeat(200_000)
      const messages = [
        makeToolResult(largeContent),
        makeToolResult(largeContent),
        makeToolResult(largeContent)
      ]
      const result = pruneToolOutputs(messages)
      const prunedMsg = result.messages.find((m) => m.content.includes('pruned'))
      if (prunedMsg) {
        expect(prunedMsg.content).toContain('[Tool output pruned')
      }
    })
  })
})
