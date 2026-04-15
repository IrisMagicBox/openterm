import { describe, it, expect } from 'vitest'
import {
  estimateTokenCount,
  estimateMessagesTokens,
  getContextBudget,
  isOverflow,
  PRUNE_PROTECT_TOKENS,
  PRUNE_MINIMUM_TOKENS
} from '../token-counter'
import { CONTEXT_WINDOW_TOKENS, CONTEXT_RESERVE_TOKENS } from '../../constants'

describe('token-counter', () => {
  describe('estimateTokenCount', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokenCount('')).toBe(0)
    })

    it('estimates ~1 token per 4 characters', () => {
      expect(estimateTokenCount('abcd')).toBe(1)
      expect(estimateTokenCount('abcdefgh')).toBe(2)
    })

    it('handles non-round divisions', () => {
      expect(estimateTokenCount('abc')).toBe(1)
      expect(estimateTokenCount('abcde')).toBe(1)
      expect(estimateTokenCount('abcdefg')).toBe(2)
    })

    it('never returns negative', () => {
      expect(estimateTokenCount('')).toBeGreaterThanOrEqual(0)
    })
  })

  describe('estimateMessagesTokens', () => {
    it('returns 0 for empty array', () => {
      expect(estimateMessagesTokens([])).toBe(0)
    })

    it('counts message content', () => {
      const messages = [
        { content: 'Hello world!', role: 'user' as const, id: '1', topicId: 't1', timestamp: 0 }
      ]
      expect(estimateMessagesTokens(messages)).toBe(estimateTokenCount('Hello world!'))
    })

    it('counts tool call arguments', () => {
      const messages = [
        {
          content: '',
          role: 'assistant' as const,
          id: '1',
          topicId: 't1',
          timestamp: 0,
          toolCalls: [
            {
              id: 'tc1',
              type: 'function' as const,
              function: { name: 'test', arguments: '{"a":1}' }
            }
          ]
        }
      ]
      expect(estimateMessagesTokens(messages)).toBe(estimateTokenCount('{"a":1}'))
    })

    it('counts tool name for result messages', () => {
      const messages = [
        {
          content: 'result',
          role: 'tool' as const,
          id: '1',
          topicId: 't1',
          timestamp: 0,
          name: 'execute_command',
          toolCallId: 'tc1'
        }
      ]
      expect(estimateMessagesTokens(messages)).toBe(
        estimateTokenCount('result') + estimateTokenCount('execute_command')
      )
    })
  })

  describe('getContextBudget', () => {
    it('calculates budget with default values', () => {
      const budget = getContextBudget(10_000)
      expect(budget.windowSize).toBe(CONTEXT_WINDOW_TOKENS)
      expect(budget.reserved).toBe(CONTEXT_RESERVE_TOKENS)
      expect(budget.usable).toBe(CONTEXT_WINDOW_TOKENS - CONTEXT_RESERVE_TOKENS)
      expect(budget.used).toBe(10_000)
      expect(budget.remaining).toBe(CONTEXT_WINDOW_TOKENS - CONTEXT_RESERVE_TOKENS - 10_000)
      expect(budget.isOverflow).toBe(false)
    })

    it('detects overflow when used >= usable', () => {
      const usable = CONTEXT_WINDOW_TOKENS - CONTEXT_RESERVE_TOKENS
      const budget = getContextBudget(usable)
      expect(budget.isOverflow).toBe(true)
    })

    it('clamps remaining to 0 when over budget', () => {
      const usable = CONTEXT_WINDOW_TOKENS - CONTEXT_RESERVE_TOKENS
      const budget = getContextBudget(usable + 1000)
      expect(budget.remaining).toBe(0)
    })

    it('allows overriding window and reserve', () => {
      const budget = getContextBudget(100, 1000, 200)
      expect(budget.windowSize).toBe(1000)
      expect(budget.reserved).toBe(200)
      expect(budget.usable).toBe(800)
      expect(budget.remaining).toBe(700)
    })
  })

  describe('isOverflow', () => {
    it('returns false when under budget', () => {
      expect(isOverflow(1000)).toBe(false)
    })

    it('returns true when at or over budget', () => {
      const usable = CONTEXT_WINDOW_TOKENS - CONTEXT_RESERVE_TOKENS
      expect(isOverflow(usable)).toBe(true)
      expect(isOverflow(usable + 1)).toBe(true)
    })
  })

  describe('prune thresholds', () => {
    it('exports positive values', () => {
      expect(PRUNE_PROTECT_TOKENS).toBeGreaterThan(0)
      expect(PRUNE_MINIMUM_TOKENS).toBeGreaterThan(0)
    })
  })
})
