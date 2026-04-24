import { describe, it, expect } from 'vitest'
import { PRUNE_PROTECT_TOKENS } from '../token-counter'
import type { Message } from '../../../shared/types'
import {
  buildAnchoredCompactionPrompt,
  pruneToolOutputs,
  selectTailMessages
} from '../compaction-policy'

function makeMessage(role: Message['role'], content: string, id: string): Message {
  return {
    id,
    topicId: 'topic-1',
    role,
    content,
    timestamp: 1
  }
}

function makeToolResult(content: string, id = 'tool-1'): Message {
  return { ...makeMessage('tool', content, id), name: 'execute_command', toolCallId: id }
}

function makeUserMsg(content: string, id = 'user-1'): Message {
  return makeMessage('user', content, id)
}

function makeAssistantMsg(content: string, id = 'assistant-1'): Message {
  return makeMessage('assistant', content, id)
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
      const messages = [makeToolResult(largeContent, 'old'), makeToolResult(largeContent, 'new')]
      const result = pruneToolOutputs(messages)
      expect(result.prunedCount).toBeGreaterThanOrEqual(1)
    })

    it('protects the most recent tool output before pruning older outputs', () => {
      const largeContent = 'x'.repeat((PRUNE_PROTECT_TOKENS + 1) * 4)
      const messages = [
        makeToolResult(largeContent, 'old-tool-call'),
        makeToolResult('recent output', 'recent-tool-call')
      ]
      const result = pruneToolOutputs(messages)

      expect(result.messages[0].content).toContain('[Tool output pruned')
      expect(result.messages[1].content).toBe('recent output')
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

  describe('anchored compaction prompt', () => {
    it('requires stable continuation sections', () => {
      const prompt = buildAnchoredCompactionPrompt({ conversationText: 'user: deploy app' })
      expect(prompt).toContain('## Goal')
      expect(prompt).toContain('## Constraints & Preferences')
      expect(prompt).toContain('## Next Steps')
      expect(prompt).toContain('## Relevant Hosts/Files/Commands')
    })
  })

  describe('selectTailMessages', () => {
    it('keeps the last user-led turns', () => {
      const messages = [
        makeUserMsg('one', 'u1'),
        makeAssistantMsg('a1', 'a1'),
        makeUserMsg('two', 'u2'),
        makeAssistantMsg('a2', 'a2'),
        makeUserMsg('three', 'u3'),
        makeAssistantMsg('a3', 'a3')
      ]

      const tail = selectTailMessages(messages, 2)

      expect(tail.tailStartMessageId).toBe('u2')
      expect(tail.messages.map((message) => message.id)).toEqual(['u2', 'a2', 'u3', 'a3'])
      expect(tail.droppedCount).toBe(2)
    })
  })
})
