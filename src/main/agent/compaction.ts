/**
 * Context compaction for managing conversation overflow.
 *
 * When the token count exceeds the context budget, this module:
 * 1. Prunes old tool outputs (keeping the most recent PRUNE_PROTECT_TOKENS worth)
 * 2. Generates a summary of the conversation via LLM (compaction)
 * 3. Replaces old messages with the summary
 */

import { getAIClient, getCurrentModel } from '../ai'
import { logger } from '../logger'
import { estimateMessagesTokens, isOverflow } from './token-counter'
import type { Message } from '../../shared/types'
import {
  buildAnchoredCompactionPrompt,
  messagesToCompactionText,
  pruneToolOutputs,
  selectTailMessages
} from './compaction-policy'
import { CONTEXT_RESERVE_TOKENS } from '../constants'

export type CompactionMode = 'none' | 'prune_only' | 'summary'

export interface CompactionResult {
  mode: CompactionMode
  summary: string
  compactedMessages: Message[]
  prunedCount: number
  prunedTokens: number
  originalTokenEstimate: number
  compactedTokenEstimate: number
  tailStartMessageId?: string
  tailMessageCount: number
}

/**
 * Compact conversation by generating an LLM summary.
 * Uses the compaction prompt to create a summary that replaces old messages.
 */
export async function compactContext(
  messages: Message[],
  opts: {
    modelContextWindow?: number
    reserveTokens?: number
    force?: boolean
  } = {}
): Promise<CompactionResult> {
  const originalTokens = estimateMessagesTokens(messages)
  const reserveTokens = opts.reserveTokens ?? CONTEXT_RESERVE_TOKENS

  if (!opts.force && !isOverflow(originalTokens, opts.modelContextWindow, reserveTokens)) {
    return {
      mode: 'none',
      summary: '',
      compactedMessages: messages,
      prunedCount: 0,
      prunedTokens: 0,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: originalTokens,
      tailMessageCount: messages.length
    }
  }

  logger.info('Compaction', 'Context overflow detected', {
    tokens: originalTokens,
    messages: messages.length
  })

  // Step 1: Prune tool outputs first
  const {
    messages: prunedMessages,
    prunedCount,
    prunedTokens: prunedOutputTokens
  } = pruneToolOutputs(messages)
  const prunedTokenEstimate = estimateMessagesTokens(prunedMessages)
  const tail = selectTailMessages(prunedMessages)

  if (!isOverflow(prunedTokenEstimate, opts.modelContextWindow, reserveTokens) && prunedCount > 0) {
    logger.info('Compaction', 'Pruning sufficient, no LLM summary needed', {
      prunedCount,
      tokensRecovered: originalTokens - prunedTokenEstimate
    })
    return {
      mode: 'prune_only',
      summary: '',
      compactedMessages: prunedMessages,
      prunedCount,
      prunedTokens: prunedOutputTokens,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: prunedTokenEstimate,
      tailStartMessageId: tail.tailStartMessageId,
      tailMessageCount: tail.messages.length
    }
  }

  // Step 2: Generate LLM summary
  try {
    const client = getAIClient()
    const model = getCurrentModel()

    const tailStartIndex = tail.tailStartMessageId
      ? prunedMessages.findIndex((message) => message.id === tail.tailStartMessageId)
      : -1
    const messagesToSummarize =
      tailStartIndex > 0 ? prunedMessages.slice(0, tailStartIndex) : prunedMessages.slice(0, -1)
    if (messagesToSummarize.length === 0) {
      return {
        mode: 'none',
        summary: '',
        compactedMessages: prunedMessages,
        prunedCount,
        prunedTokens: prunedOutputTokens,
        originalTokenEstimate: originalTokens,
        compactedTokenEstimate: prunedTokenEstimate,
        tailStartMessageId: tail.tailStartMessageId,
        tailMessageCount: tail.messages.length
      }
    }
    const conversationText = messagesToCompactionText(messagesToSummarize)
    const prompt = buildAnchoredCompactionPrompt({ conversationText })

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a conversation summarizer. Create concise anchored summaries for continuing long-running agent tasks.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0
    })

    const summary = response.choices[0]?.message?.content || ''
    const compactedMessages = [
      { id: '', topicId: '', role: 'assistant' as const, content: summary, timestamp: 0 },
      ...tail.messages
    ]

    return {
      mode: 'summary',
      summary,
      compactedMessages,
      prunedCount,
      prunedTokens: prunedOutputTokens,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: estimateMessagesTokens(compactedMessages),
      tailStartMessageId: tail.tailStartMessageId,
      tailMessageCount: tail.messages.length
    }
  } catch (error) {
    logger.error('Compaction', 'Failed to generate summary', error)
    return {
      mode: 'none',
      summary: '',
      compactedMessages: messages,
      prunedCount,
      prunedTokens: prunedOutputTokens,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: originalTokens,
      tailStartMessageId: tail.tailStartMessageId,
      tailMessageCount: tail.messages.length
    }
  }
}
