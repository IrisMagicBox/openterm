/**
 * ProviderAdapter — Wraps the raw OpenAI client with usage tracking.
 * Tracks token usage per session, supports streaming, and provides
 * cost aggregation for parent→child session relationships.
 */

import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { getAIClient, getCurrentModel } from '../ai'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}

export interface SessionUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedTokens: number
  totalTokens: number
  llmCalls: number
}

export interface ChatResult {
  content: string | null
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  usage: TokenUsage
  finishReason: string | null
}

export interface StreamChunk {
  content: string | null
  toolCalls?: Array<{
    index: number
    id?: string
    type?: 'function'
    function?: { name?: string; arguments?: string }
  }>
  finishReason: string | null
  usage?: TokenUsage
}

export class ProviderAdapter {
  private sessionUsage: SessionUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalTokens: 0,
    llmCalls: 0
  }

  async chat(params: {
    messages: ChatCompletionMessageParam[]
    tools?: ChatCompletionTool[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    temperature?: number
    maxTokens?: number
    model?: string
    abortSignal?: AbortSignal
  }): Promise<ChatResult> {
    const client = getAIClient()
    const model = params.model ?? getCurrentModel()

    const response = await client.chat.completions.create(
      {
        model,
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.toolChoice,
        temperature: params.temperature,
        max_tokens: params.maxTokens
      },
      { signal: params.abortSignal }
    )

    const choice = response.choices[0]
    const usage = this.extractUsage(response.usage)
    this.accumulateUsage(usage)

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls
        ?.filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })),
      usage,
      finishReason: choice.finish_reason
    }
  }

  async *stream(params: {
    messages: ChatCompletionMessageParam[]
    tools?: ChatCompletionTool[]
    toolChoice?: 'auto' | 'none'
    temperature?: number
    model?: string
    abortSignal?: AbortSignal
  }): AsyncGenerator<StreamChunk> {
    const client = getAIClient()
    const model = params.model ?? getCurrentModel()

    const stream = await client.chat.completions.create(
      {
        model,
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.toolChoice,
        temperature: params.temperature,
        stream: true,
        stream_options: { include_usage: true }
      },
      { signal: params.abortSignal }
    )

    for await (const chunk of stream) {
      const choice = chunk.choices[0]

      const streamChunk: StreamChunk = {
        content: choice?.delta?.content ?? null,
        finishReason: choice?.finish_reason ?? null
      }

      if (choice?.delta?.tool_calls) {
        streamChunk.toolCalls = choice.delta.tool_calls.map((tc) => ({
          index: tc.index,
          id: tc.id,
          type: tc.type as 'function' | undefined,
          function: { name: tc.function?.name, arguments: tc.function?.arguments }
        }))
      }

      if (chunk.usage) {
        const usage = this.extractUsage(chunk.usage)
        streamChunk.usage = usage
        this.accumulateUsage(usage)
      }

      yield streamChunk
    }
  }

  getSessionUsage(): SessionUsage {
    return { ...this.sessionUsage }
  }

  resetSessionUsage(): void {
    this.sessionUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      llmCalls: 0
    }
  }

  mergeChildUsage(childUsage: SessionUsage): void {
    this.sessionUsage.totalInputTokens += childUsage.totalInputTokens
    this.sessionUsage.totalOutputTokens += childUsage.totalOutputTokens
    this.sessionUsage.totalCachedTokens += childUsage.totalCachedTokens
    this.sessionUsage.totalTokens += childUsage.totalTokens
    this.sessionUsage.llmCalls += childUsage.llmCalls
  }

  private extractUsage(
    raw: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
  ): TokenUsage {
    if (!raw) return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
    const cached = (raw as Record<string, unknown>).prompt_tokens_details
      ? (((raw as Record<string, unknown>).prompt_tokens_details as Record<string, unknown>)
          .cached_tokens ?? 0)
      : 0
    return {
      inputTokens: raw.prompt_tokens ?? 0,
      outputTokens: raw.completion_tokens ?? 0,
      cachedTokens: cached as number,
      totalTokens: raw.total_tokens ?? 0
    }
  }

  private accumulateUsage(usage: TokenUsage): void {
    this.sessionUsage.totalInputTokens += usage.inputTokens
    this.sessionUsage.totalOutputTokens += usage.outputTokens
    this.sessionUsage.totalCachedTokens += usage.cachedTokens
    this.sessionUsage.totalTokens += usage.totalTokens
    this.sessionUsage.llmCalls++
  }
}
