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
  tokenBudget?: number
  debugReport?: Record<string, unknown>
}

export interface LayerReport {
  name: string
  priority: number
  tokenEstimate: number
  includedTokenEstimate: number
  tokenBudget?: number
  included: boolean
  truncated: boolean
  reason: 'included' | 'empty' | 'budget_exhausted' | 'truncated_to_fit'
  originalCharLength: number
  includedCharLength: number
  debugReport?: Record<string, unknown>
}

export interface ContextReport {
  generatedAt: number
  modelContextWindow: number
  reserveTokens: number
  system: {
    tokenEstimate: number
    charLength: number
  }
  turns: {
    tokenEstimate: number
    messageCount: number
  }
  history: {
    availableTokens: number
    totalMessages: number
    includedMessages: number
    droppedMessages: number
    includedTokenEstimate: number
  }
  layers: LayerReport[]
  budget: ContextBudget
}

export interface AssembledContext {
  systemPrompt: string
  messages: ChatCompletionMessageParam[]
  budget: ContextBudget
  layerReport: LayerReport[]
  contextReport: ContextReport
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

  /** Override context budget after construction. */
  setBudget(opts: { modelContextWindow?: number; reserveTokens?: number }): this {
    this.modelContextWindow = opts.modelContextWindow ?? this.modelContextWindow
    this.reserveTokens = opts.reserveTokens ?? this.reserveTokens
    return this
  }

  /** Set the base system prompt (always included, highest priority) */
  setSystemPrompt(prompt: string): this {
    this.systemBase = prompt
    return this
  }

  /** Add a context layer with name, content, and priority */
  addLayer(
    name: string,
    content: string,
    priority: number,
    opts?: { tokenBudget?: number; debugReport?: Record<string, unknown> }
  ): this {
    this.layers.push({ name, content, priority, ...opts })
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
      const rawContent = layer.content || ''
      const layerTokens = estimateTokenCount(rawContent)
      const originalCharLength = rawContent.length
      if (!rawContent.trim()) {
        layerReports.push({
          name: layer.name,
          priority: layer.priority,
          tokenEstimate: layerTokens,
          includedTokenEstimate: 0,
          tokenBudget: layer.tokenBudget,
          included: true,
          truncated: false,
          reason: 'empty',
          originalCharLength,
          includedCharLength: 0,
          debugReport: layer.debugReport
        })
        continue
      }
      if (remainingBudget <= 0) {
        layerReports.push({
          name: layer.name,
          priority: layer.priority,
          tokenEstimate: layerTokens,
          includedTokenEstimate: 0,
          tokenBudget: layer.tokenBudget,
          included: false,
          truncated: false,
          reason: 'budget_exhausted',
          originalCharLength,
          includedCharLength: 0,
          debugReport: layer.debugReport
        })
        continue
      }

      const perLayerBudget = layer.tokenBudget ?? layerTokens
      const allowedTokens = Math.min(remainingBudget, perLayerBudget)
      if (allowedTokens <= 0) {
        layerReports.push({
          name: layer.name,
          priority: layer.priority,
          tokenEstimate: layerTokens,
          includedTokenEstimate: 0,
          tokenBudget: layer.tokenBudget,
          included: false,
          truncated: false,
          reason: 'budget_exhausted',
          originalCharLength,
          includedCharLength: 0,
          debugReport: layer.debugReport
        })
        continue
      }

      if (layerTokens <= allowedTokens) {
        includedLayerContents.push(rawContent)
        remainingBudget -= layerTokens
        layerReports.push({
          name: layer.name,
          priority: layer.priority,
          tokenEstimate: layerTokens,
          includedTokenEstimate: layerTokens,
          tokenBudget: layer.tokenBudget,
          included: true,
          truncated: false,
          reason: 'included',
          originalCharLength,
          includedCharLength: rawContent.length,
          debugReport: layer.debugReport
        })
      } else {
        // Truncate layer to fit
        const maxChars = allowedTokens * 4 // 4 chars/token heuristic
        const truncated = rawContent.slice(0, maxChars) + '\n...[truncated]'
        includedLayerContents.push(truncated)
        remainingBudget -= allowedTokens
        layerReports.push({
          name: layer.name,
          priority: layer.priority,
          tokenEstimate: layerTokens,
          includedTokenEstimate: estimateTokenCount(truncated),
          tokenBudget: layer.tokenBudget,
          included: true,
          truncated: true,
          reason: 'truncated_to_fit',
          originalCharLength,
          includedCharLength: truncated.length,
          debugReport: layer.debugReport
        })
      }
    }

    // Build system message: base prompt + included layers
    const systemContent = [this.systemBase, ...includedLayerContents].join('\n\n')

    // Window history to fit remaining budget
    const history = this.windowHistory(remainingBudget)
    const historyMessages = history.messages

    // Assemble final messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...this.toChatMessages(historyMessages),
      ...this.turnMessages
    ]

    const totalUsed =
      estimateTokenCount(systemContent) + estimateMessagesTokens(historyMessages) + turnTokens

    const budget = getContextBudget(totalUsed, this.modelContextWindow, this.reserveTokens)
    const contextReport: ContextReport = {
      generatedAt: Date.now(),
      modelContextWindow: this.modelContextWindow,
      reserveTokens: this.reserveTokens,
      system: {
        tokenEstimate: systemTokens,
        charLength: this.systemBase.length
      },
      turns: {
        tokenEstimate: turnTokens,
        messageCount: this.turnMessages.length
      },
      history: {
        availableTokens: Math.max(0, remainingBudget),
        totalMessages: this.history.length,
        includedMessages: historyMessages.length,
        droppedMessages: Math.max(0, this.history.length - historyMessages.length),
        includedTokenEstimate: history.tokenEstimate
      },
      layers: layerReports,
      budget
    }

    return {
      systemPrompt: systemContent,
      messages,
      budget,
      layerReport: layerReports,
      contextReport
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

  private windowHistory(availableTokens: number): { messages: Message[]; tokenEstimate: number } {
    if (availableTokens <= 0 || this.history.length === 0) {
      return { messages: [], tokenEstimate: 0 }
    }

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
    return { messages: result, tokenEstimate: used }
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
