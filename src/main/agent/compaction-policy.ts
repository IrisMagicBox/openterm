import type { Message } from '../../shared/types'
import { PRUNE_PROTECT_TOKENS } from './token-counter'

export const COMPACTION_SUMMARY_TEMPLATE = `Output exactly this Markdown structure and keep the section order unchanged:
---
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Hosts/Files/Commands
- [host, file, directory, command, or terminal id: why it matters, or "(none)"]
---

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact host ids, terminal ids, file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`

export interface PrunedToolOutputResult {
  messages: Message[]
  prunedCount: number
  prunedTokens: number
}

export interface TailSelection {
  messages: Message[]
  tailStartMessageId?: string
  droppedCount: number
}

export function buildAnchoredCompactionPrompt(input: {
  conversationText: string
  previousSummary?: string
}): string {
  const anchor = input.previousSummary
    ? [
        'Update the anchored summary below using the conversation history above.',
        'Preserve still-true details, remove stale details, and merge in new facts.',
        '<previous-summary>',
        input.previousSummary,
        '</previous-summary>'
      ].join('\n')
    : 'Create a new anchored summary from the conversation history above.'

  return [input.conversationText, '---', anchor, COMPACTION_SUMMARY_TEMPLATE].join('\n\n')
}

/**
 * Prunes older tool outputs while protecting the most recent tool output budget.
 */
export function pruneToolOutputs(messages: Message[]): PrunedToolOutputResult {
  let protectedTokens = 0
  let prunedCount = 0
  let prunedTokens = 0
  const result = [...messages]

  for (let index = result.length - 1; index >= 0; index--) {
    const msg = result[index]
    if (msg.role !== 'tool' && !(msg.toolCalls && msg.toolCalls.length > 0)) continue
    if (msg.role !== 'tool' || !msg.content) continue

    const msgTokens = Math.ceil(msg.content.length / 4)
    if (protectedTokens + msgTokens <= PRUNE_PROTECT_TOKENS) {
      protectedTokens += msgTokens
      continue
    }

    prunedCount++
    prunedTokens += msgTokens
    result[index] = {
      ...msg,
      content: `[Tool output pruned - ${msgTokens} tokens recovered]`
    }
  }

  return { messages: result, prunedCount, prunedTokens }
}

/**
 * Keeps the most recent user-led turns. A turn begins at a user message and ends
 * before the next user message.
 */
export function selectTailMessages(messages: Message[], tailTurns = 2): TailSelection {
  if (tailTurns <= 0 || messages.length === 0) {
    return { messages: [], droppedCount: messages.length }
  }

  const userIndexes: number[] = []
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].role === 'user') userIndexes.push(index)
  }

  if (userIndexes.length === 0) {
    const fallback = messages.slice(-Math.min(messages.length, tailTurns * 2))
    return {
      messages: fallback,
      tailStartMessageId: fallback[0]?.id,
      droppedCount: messages.length - fallback.length
    }
  }

  const startIndex = userIndexes[Math.max(0, userIndexes.length - tailTurns)]
  const tail = messages.slice(startIndex)
  return {
    messages: tail,
    tailStartMessageId: tail[0]?.id,
    droppedCount: startIndex
  }
}

export function messagesToCompactionText(messages: Message[]): string {
  return messages
    .map((message) => {
      const name = message.name ? ` name=${message.name}` : ''
      const toolCall = message.toolCallId ? ` tool_call_id=${message.toolCallId}` : ''
      return `${message.role}${name}${toolCall}: ${message.content || ''}`
    })
    .join('\n\n')
}
