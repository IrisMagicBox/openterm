/**
 * ProviderAdapter wraps provider-specific chat APIs with one OpenAI-shaped
 * interface for the agent loop. OpenAI-compatible providers use the OpenAI SDK;
 * Anthropic uses the Messages API and is translated at the boundary.
 */

import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import type { Provider } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'
import { buildProviderChatUrl, getAIClient, resolveProviderSelection } from '../ai'

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

export interface ProviderAdapterOptions {
  topicId?: string
  providerId?: string
  modelId?: string
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicRequest = {
  model: string
  messages: AnthropicMessage[]
  system?: string
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>
  tool_choice?: { type: 'auto' | 'none' } | { type: 'tool'; name: string }
  temperature?: number
  max_tokens: number
  stream?: boolean
}

export class ProviderAdapter {
  private sessionUsage: SessionUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalTokens: 0,
    llmCalls: 0
  }

  constructor(private readonly options: ProviderAdapterOptions = {}) {}

  async chat(params: {
    messages: ChatCompletionMessageParam[]
    tools?: ChatCompletionTool[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    temperature?: number
    maxTokens?: number
    model?: string
    abortSignal?: AbortSignal
  }): Promise<ChatResult> {
    const selection = resolveProviderSelection({ ...this.options, modelId: params.model })
    const model = params.model ?? selection.modelId

    if (selection.provider.type === 'anthropic') {
      return this.anthropicChat(selection.provider, model, params)
    }

    const client = getAIClient({
      ...this.options,
      providerId: selection.provider.id,
      modelId: selection.modelRecordId ?? selection.modelId
    })
    const request: Record<string, unknown> = {
      model,
      messages: params.messages,
      temperature: this.shouldSendTemperature(selection.provider, model)
        ? params.temperature
        : undefined,
      max_tokens: params.maxTokens
    }

    if (params.tools && params.tools.length > 0 && params.toolChoice !== 'none') {
      request.tools = params.tools
      request.tool_choice = params.toolChoice
    } else if (params.toolChoice === 'none') {
      request.tool_choice = 'none'
    }

    const response = await client.chat.completions.create(request as any, {
      signal: params.abortSignal
    })

    const choice = response.choices[0]
    const usage = this.extractOpenAIUsage(response.usage)
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
    const selection = resolveProviderSelection({ ...this.options, modelId: params.model })
    const model = params.model ?? selection.modelId

    if (selection.provider.type === 'anthropic') {
      yield* this.anthropicStream(selection.provider, model, params)
      return
    }

    const client = getAIClient({
      ...this.options,
      providerId: selection.provider.id,
      modelId: selection.modelRecordId ?? selection.modelId
    })
    const request: Record<string, unknown> = {
      model,
      messages: params.messages,
      temperature: this.shouldSendTemperature(selection.provider, model)
        ? params.temperature
        : undefined,
      stream: true
    }

    if (params.tools && params.tools.length > 0 && params.toolChoice !== 'none') {
      request.tools = params.tools
      request.tool_choice = params.toolChoice
    } else if (params.toolChoice === 'none') {
      request.tool_choice = 'none'
    }

    if (selection.provider.config?.apiOptions?.isNotSupportStreamOptions !== true) {
      request.stream_options = { include_usage: true }
    }

    const stream = (await client.chat.completions.create(request as any, {
      signal: params.abortSignal
    })) as unknown as AsyncIterable<any>

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
        const usage = this.extractOpenAIUsage(chunk.usage)
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

  private async anthropicChat(
    provider: Provider,
    model: string,
    params: {
      messages: ChatCompletionMessageParam[]
      tools?: ChatCompletionTool[]
      toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
      temperature?: number
      maxTokens?: number
      abortSignal?: AbortSignal
    }
  ): Promise<ChatResult> {
    const response = await this.fetchAnthropic(
      provider,
      {
        ...this.toAnthropicRequest(provider, model, params),
        stream: false
      },
      params.abortSignal
    )
    const data = await response.json()
    const usage = this.extractAnthropicUsage(data.usage)
    this.accumulateUsage(usage)

    const contentBlocks = Array.isArray(data.content) ? data.content : []
    const text = contentBlocks
      .filter((block: any) => block.type === 'text' && typeof block.text === 'string')
      .map((block: any) => block.text)
      .join('')
    const toolCalls = contentBlocks
      .filter((block: any) => block.type === 'tool_use')
      .map((block: any) => ({
        id: String(block.id),
        type: 'function' as const,
        function: {
          name: String(block.name),
          arguments: JSON.stringify(block.input ?? {})
        }
      }))

    return {
      content: text || null,
      toolCalls,
      usage,
      finishReason: data.stop_reason ?? null
    }
  }

  private async *anthropicStream(
    provider: Provider,
    model: string,
    params: {
      messages: ChatCompletionMessageParam[]
      tools?: ChatCompletionTool[]
      toolChoice?: 'auto' | 'none'
      temperature?: number
      abortSignal?: AbortSignal
    }
  ): AsyncGenerator<StreamChunk> {
    const response = await this.fetchAnthropic(
      provider,
      {
        ...this.toAnthropicRequest(provider, model, params),
        stream: true
      },
      params.abortSignal
    )

    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
    let finishReason: string | null = null

    for await (const event of this.readSse(response)) {
      if (event.type === 'message_start') {
        usage = this.extractAnthropicUsage(event.message?.usage)
      } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        yield {
          content: null,
          finishReason: null,
          toolCalls: [
            {
              index: event.index ?? 0,
              id: event.content_block.id,
              type: 'function',
              function: { name: event.content_block.name, arguments: '' }
            }
          ]
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          yield {
            content: event.delta.text ?? null,
            finishReason: null
          }
        } else if (event.delta?.type === 'input_json_delta') {
          yield {
            content: null,
            finishReason: null,
            toolCalls: [
              {
                index: event.index ?? 0,
                type: 'function',
                function: { arguments: event.delta.partial_json ?? '' }
              }
            ]
          }
        }
      } else if (event.type === 'message_delta') {
        finishReason = event.delta?.stop_reason ?? finishReason
        usage = this.mergeTokenUsage(usage, this.extractAnthropicUsage(event.usage))
      } else if (event.type === 'message_stop') {
        this.accumulateUsage(usage)
        yield {
          content: null,
          finishReason,
          usage
        }
      }
    }
  }

  private toAnthropicRequest(
    provider: Provider,
    model: string,
    params: {
      messages: ChatCompletionMessageParam[]
      tools?: ChatCompletionTool[]
      toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
      temperature?: number
      maxTokens?: number
    }
  ): AnthropicRequest {
    const { system, messages } = this.toAnthropicMessages(params.messages)
    const tools =
      params.tools && params.tools.length > 0 && params.toolChoice !== 'none'
        ? params.tools
            .filter(
              (tool): tool is Extract<ChatCompletionTool, { type: 'function' }> =>
                tool.type === 'function'
            )
            .map((tool) => ({
              name: tool.function.name,
              description: tool.function.description,
              input_schema: tool.function.parameters || { type: 'object', properties: {} }
            }))
        : undefined

    const request: AnthropicRequest = {
      model,
      system: system || undefined,
      messages,
      tools,
      max_tokens: params.maxTokens ?? 4096
    }

    if (this.shouldSendTemperature(provider, model)) {
      request.temperature = params.temperature
    }

    if (params.toolChoice === 'none') {
      request.tool_choice = { type: 'none' }
    } else if (params.toolChoice && typeof params.toolChoice !== 'string') {
      request.tool_choice = { type: 'tool', name: params.toolChoice.function.name }
    } else if (tools && tools.length > 0) {
      request.tool_choice = { type: 'auto' }
    }

    return request
  }

  private toAnthropicMessages(messages: ChatCompletionMessageParam[]): {
    system: string
    messages: AnthropicMessage[]
  } {
    const system: string[] = []
    const result: AnthropicMessage[] = []
    let pendingToolResults: AnthropicContentBlock[] = []

    const flushToolResults = (): void => {
      if (pendingToolResults.length === 0) return
      result.push({ role: 'user', content: pendingToolResults })
      pendingToolResults = []
    }

    for (const message of messages) {
      if (message.role === 'system' || message.role === 'developer') {
        const content = this.stringifyContent(message.content)
        if (content) system.push(content)
        continue
      }

      if (message.role === 'tool') {
        pendingToolResults.push({
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: this.stringifyContent(message.content)
        })
        continue
      }

      flushToolResults()

      if (message.role === 'assistant') {
        const blocks: AnthropicContentBlock[] = []
        const text = this.stringifyContent(message.content)
        if (text) blocks.push({ type: 'text', text })
        for (const toolCall of message.tool_calls ?? []) {
          if (toolCall.type !== 'function') continue
          blocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: this.parseToolInput(toolCall.function.arguments)
          })
        }
        result.push({ role: 'assistant', content: blocks.length > 0 ? blocks : '' })
      } else if (message.role === 'user') {
        result.push({ role: 'user', content: this.stringifyContent(message.content) })
      }
    }

    flushToolResults()

    return {
      system: system.join('\n\n'),
      messages: result
    }
  }

  private async fetchAnthropic(
    provider: Provider,
    body: AnthropicRequest,
    signal?: AbortSignal
  ): Promise<Response> {
    const response = await fetch(buildProviderChatUrl(provider), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': provider.apiVersion || '2023-06-01',
        ...(provider.config?.extra_headers || {})
      },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      const data: any = await response.json().catch(() => ({}))
      const message = data.error?.message || data.error || response.statusText
      throw new Error(`Anthropic API error (${response.status}): ${message}`)
    }

    return response
  }

  private async *readSse(response: Response): AsyncGenerator<any> {
    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
        const payload = dataLines.join('\n')
        if (payload && payload !== '[DONE]') {
          try {
            yield JSON.parse(payload)
          } catch (error) {
            throw new Error(`Failed to parse provider stream event: ${getErrorMessage(error)}`)
          }
        }
        separatorIndex = buffer.indexOf('\n\n')
      }
    }
  }

  private stringifyContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part === 'object' && 'text' in part) {
            return String((part as { text?: unknown }).text ?? '')
          }
          return ''
        })
        .join('')
    }
    return content == null ? '' : String(content)
  }

  private parseToolInput(raw: string): unknown {
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return {}
    }
  }

  private shouldSendTemperature(provider: Provider, model: string): boolean {
    if (provider.type === 'anthropic') return true
    return !/^(?:o[134](?:-|$)|gpt-5)/i.test(model)
  }

  private extractOpenAIUsage(
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

  private extractAnthropicUsage(
    raw:
      | {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      | undefined
  ): TokenUsage {
    if (!raw) return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
    const inputTokens = raw.input_tokens ?? 0
    const outputTokens = raw.output_tokens ?? 0
    const cachedTokens = raw.cache_read_input_tokens ?? 0
    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens + (raw.cache_creation_input_tokens ?? 0)
    }
  }

  private mergeTokenUsage(base: TokenUsage, next: TokenUsage): TokenUsage {
    const inputTokens = next.inputTokens || base.inputTokens
    const outputTokens = next.outputTokens || base.outputTokens
    const cachedTokens = next.cachedTokens || base.cachedTokens
    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: Math.max(next.totalTokens, base.totalTokens, inputTokens + outputTokens)
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
