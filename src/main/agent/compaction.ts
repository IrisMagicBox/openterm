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
import { estimateMessagesTokens, isOverflow, PRUNE_PROTECT_TOKENS } from './token-counter'
import type { Message } from '../../shared/types'

const COMPACTION_PROMPT = `请对以上对话提供详细的摘要，以便后续继续执行任务。
重点保留以下对继续执行有帮助的信息：
- 用户的目标是什么
- 用户给出过哪些重要指令
- 过程中发现了什么或学到了什么
- 哪些工作已完成、哪些正在进行、哪些还未开始
- 涉及哪些主机、终端、文件

请按以下结构组织摘要：
## 目标
[用户想要完成的任务]

## 指令
[用户给出的重要指令]

## 发现
[对话过程中的重要发现]

## 已完成
[完成的工作、进行中的工作、剩余的工作]

## 上下文
[相关的主机、终端、文件、命令]`

export interface CompactionResult {
  summary: string
  prunedCount: number
  originalTokenEstimate: number
  compactedTokenEstimate: number
}

/**
 * Prune old tool output messages to free up tokens.
 * Keeps the most recent PRUNE_PROTECT_TOKENS worth of tool outputs.
 * Returns the pruned messages array.
 */
export function pruneToolOutputs(messages: Message[]): {
  messages: Message[]
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

    // For tool result messages, check if we should truncate the content
    if (msg.role === 'tool' && msg.content) {
      const msgTokens = Math.ceil(msg.content.length / 4)
      protectedTokens += msgTokens

      if (protectedTokens > PRUNE_PROTECT_TOKENS) {
        // This old tool output exceeds our protection budget — prune it
        prunedCount++
        prunedTokens += msgTokens
        return {
          ...msg,
          content: `[Tool output pruned — ${msgTokens} tokens recovered]`
        }
      }
    }

    return msg
  })

  return { messages: result, prunedCount, prunedTokens }
}

/**
 * Compact conversation by generating an LLM summary.
 * Uses the compaction prompt to create a summary that replaces old messages.
 */
export async function compactContext(
  messages: Message[],
  modelContextWindow?: number
): Promise<CompactionResult | null> {
  const originalTokens = estimateMessagesTokens(messages)

  if (!isOverflow(originalTokens, modelContextWindow)) {
    return null
  }

  logger.info('Compaction', 'Context overflow detected', {
    tokens: originalTokens,
    messages: messages.length
  })

  // Step 1: Prune tool outputs first
  const { messages: prunedMessages, prunedCount } = pruneToolOutputs(messages)
  const prunedTokens = estimateMessagesTokens(prunedMessages)

  if (!isOverflow(prunedTokens, modelContextWindow) && prunedCount > 0) {
    logger.info('Compaction', 'Pruning sufficient, no LLM summary needed', {
      prunedCount,
      tokensRecovered: originalTokens - prunedTokens
    })
    return {
      summary: '',
      prunedCount,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: prunedTokens
    }
  }

  // Step 2: Generate LLM summary
  try {
    const client = getAIClient()
    const model = getCurrentModel()

    const conversationText = messages
      .slice(0, -1) // Exclude the last user message (will be replayed)
      .map((m) => `${m.role}: ${m.content || ''}`)
      .join('\n\n')

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a conversation summarizer. Create concise but thorough summaries.'
        },
        { role: 'user', content: conversationText + '\n\n---\n\n' + COMPACTION_PROMPT }
      ],
      max_tokens: 2000,
      temperature: 0
    })

    const summary = response.choices[0]?.message?.content || ''

    return {
      summary,
      prunedCount,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: estimateMessagesTokens([
        { id: '', topicId: '', role: 'assistant', content: summary, timestamp: 0 },
        messages[messages.length - 1] // Keep last user message
      ])
    }
  } catch (error) {
    logger.error('Compaction', 'Failed to generate summary', error)
    return null
  }
}
