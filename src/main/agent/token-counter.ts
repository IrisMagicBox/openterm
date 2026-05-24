/**
 * Token estimation and context budget management.
 * Uses a 4 chars/token heuristic for fast estimation.
 */

import type { Message } from '../../shared/types'
import {
  CONTEXT_WINDOW_TOKENS,
  CONTEXT_RESERVE_TOKENS,
  CONTEXT_PRUNE_PROTECT_TOKENS,
  CONTEXT_PRUNE_MINIMUM_TOKENS
} from '../constants'

const CHARS_PER_TOKEN = 4

export function estimateTokenCount(text: string): number {
  return Math.max(0, Math.round((text || '').length / CHARS_PER_TOKEN))
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) {
    if (msg.content) {
      total += estimateTokenCount(msg.content)
    }
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.function?.arguments) {
          total += estimateTokenCount(tc.function.arguments)
        }
      }
    }
    if (msg.name && msg.toolCallId) {
      total += estimateTokenCount(msg.name)
    }
  }
  return total
}

export interface ContextBudget {
  windowSize: number
  reserved: number
  usable: number
  used: number
  remaining: number
  isOverflow: boolean
}

export function getContextBudget(
  usedTokens: number,
  modelContextWindow: number = CONTEXT_WINDOW_TOKENS,
  reserveTokens: number = CONTEXT_RESERVE_TOKENS
): ContextBudget {
  const usable = modelContextWindow - reserveTokens
  const remaining = usable - usedTokens
  return {
    windowSize: modelContextWindow,
    reserved: reserveTokens,
    usable,
    used: usedTokens,
    remaining: Math.max(0, remaining),
    isOverflow: usedTokens >= usable
  }
}

export function isOverflow(
  usedTokens: number,
  modelContextWindow: number = CONTEXT_WINDOW_TOKENS,
  reserveTokens: number = CONTEXT_RESERVE_TOKENS
): boolean {
  return usedTokens >= modelContextWindow - reserveTokens
}

export const PRUNE_PROTECT_TOKENS = CONTEXT_PRUNE_PROTECT_TOKENS
export const PRUNE_MINIMUM_TOKENS = CONTEXT_PRUNE_MINIMUM_TOKENS
