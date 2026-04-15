/**
 * ContextAssembler — Assembles LLM context in structured layers with token budgets.
 *
 * Replaces the ad-hoc string concatenation in AgentRunner.ts with a
 * priority-based, budgeted approach. Layers are included by priority;
 * when budget is tight, low-priority layers are truncated or dropped.
 * History is windowed from the end (most recent first).
 */

import type { Message } from '../../shared/types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { estimateTokenCount, estimateMessagesTokens, getContextBudget } from './token-counter'
import { CONTEXT_WINDOW_TOKENS, CONTEXT_RESERVE_TOKENS } from '../constants'
import type { ContextBudget } from './token-counter'

export interface ContextLayer {
  name: string
  content: string
  priority: number // Higher = more important, kept when budget is tight
}

export interface LayerReport {
  name: string
  tokenEstimate: number
  included: boolean
  truncated: boolean
}

export interface AssembledContext {
  systemPrompt: string
  messages: ChatCompletionMessageParam[]
  budget: ContextBudget
  layerReport: LayerReport[]
}

export class ContextAssembler {
  private layers: ContextLayer[] = []
  private systemBase: string = ''
  private history: Message[] = []
  private turnMessages: ChatCompletionMessageParam[] = []
  private modelContextWindow: number
  private reserveTokens: number

  constructor(opts?: { modelContextWindow?: number; reserveTokens?: number }) {
    this.modelContextWindow = opts?.modelContextWindow ?? CONTEXT_WINDOW_TOKENS
    this.reserveTokens = opts?.reserveTokens ?? CONTEXT_RESERVE_TOKENS
  }

  /** Set the base system prompt (always included, highest priority) */
  setSystemPrompt(prompt: string): this {
    this.systemBase = prompt
    return this
  }

  /** Add a context layer with name, content, and priority */
  addLayer(name: string, content: string, priority: number): this {
    this.layers.push({ name, content, priority })
    return this
  }

  /** Set conversation history (persisted messages) */
  setHistory(messages: Message[]): this {
    this.history = messages
    return this
  }

  /** Set turn messages (current agent loop turns) */
  setTurnMessages(messages: ChatCompletionMessageParam[]): this {
    this.turnMessages = messages
    return this
  }

  /**
   * Assemble the final context array respecting the token budget.
   * Layers are included by priority. If budget is exceeded, lower-priority
   * layers are truncated or dropped. History is windowed from the end.
   */
  assemble(): AssembledContext {
    const systemTokens = estimateTokenCount(this.systemBase)
    const turnTokens = this.estimateTurnTokens()

    // Sort layers by priority (descending)
    const sortedLayers = [...this.layers].sort((a, b) => b.priority - a.priority)

    // Allocate budget: system prompt + layers + history + turns
    const usableBudget = this.modelContextWindow - this.reserveTokens
    let remainingBudget = usableBudget - systemTokens - turnTokens

    const layerReports: LayerReport[] = []
    const includedLayerContents: string[] = []

    // Include layers by priority, truncate if needed
    for (const layer of sortedLayers) {
      const layerTokens = estimateTokenCount(layer.content)
      if (remainingBudget <= 0) {
        layerReports.push({
          name: layer.name,
          tokenEstimate: layerTokens,
          included: false,
          truncated: false
        })
        continue
      }
      if (layerTokens <= remainingBudget) {
        includedLayerContents.push(layer.content)
        remainingBudget -= layerTokens
        layerReports.push({
          name: layer.name,
          tokenEstimate: layerTokens,
          included: true,
          truncated: false
        })
      } else {
        // Truncate layer to fit
        const maxChars = remainingBudget * 4 // 4 chars/token heuristic
        const truncated = layer.content.slice(0, maxChars) + '\n...[truncated]'
        includedLayerContents.push(truncated)
        remainingBudget = 0
        layerReports.push({
          name: layer.name,
          tokenEstimate: layerTokens,
          included: true,
          truncated: true
        })
      }
    }

    // Build system message: base prompt + included layers
    const systemContent = [this.systemBase, ...includedLayerContents].join('\n\n')

    // Window history to fit remaining budget
    const historyMessages = this.windowHistory(remainingBudget)

    // Assemble final messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...this.toChatMessages(historyMessages),
      ...this.turnMessages
    ]

    const totalUsed =
      estimateTokenCount(systemContent) + estimateMessagesTokens(historyMessages) + turnTokens

    return {
      systemPrompt: systemContent,
      messages,
      budget: getContextBudget(totalUsed, this.modelContextWindow, this.reserveTokens),
      layerReport: layerReports
    }
  }

  private estimateTurnTokens(): number {
    let total = 0
    for (const msg of this.turnMessages) {
      if (typeof msg.content === 'string') {
        total += estimateTokenCount(msg.content)
      }
      // Tool call arguments
      if ('tool_calls' in msg && msg.tool_calls) {
        for (const tc of msg.tool_calls as Array<{ function?: { arguments?: string } }>) {
          if (tc.function?.arguments) total += estimateTokenCount(tc.function.arguments)
        }
      }
    }
    return total
  }

  private windowHistory(availableTokens: number): Message[] {
    if (availableTokens <= 0 || this.history.length === 0) return []

    // Include from the end (most recent first)
    const result: Message[] = []
    let used = 0
    for (let i = this.history.length - 1; i >= 0; i--) {
      const msg = this.history[i]
      const msgTokens = estimateTokenCount(msg.content || '')
      if (used + msgTokens > availableTokens) break
      result.unshift(msg)
      used += msgTokens
    }
    return result
  }

  private toChatMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map(
      (m) =>
        ({
          role: m.role,
          content: m.content,
          tool_calls: m.toolCalls,
          tool_call_id: m.toolCallId,
          name: m.name
        }) as ChatCompletionMessageParam
    )
  }
}
