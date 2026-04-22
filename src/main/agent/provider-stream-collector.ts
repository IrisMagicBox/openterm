import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import type { AgentPart } from '../../shared/types'
import { logger } from '../logger'
import { AGENT_TEMPERATURE } from '../constants'
import { agentRunStore } from './agent-run-store'
import { normalizeAgentError, retryDelayMs } from './agent-error'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions, StreamResult, ToolChoice } from './agent-processor-types'
import type { TokenUsage } from './provider-adapter'

interface StreamedToolCall {
  index: number
  id: string
  name: string
  arguments: string
  partId: string
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function inferToolNameFromArguments(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    if (
      typeof parsed.hostId === 'string' &&
      typeof parsed.command === 'string' &&
      typeof parsed.reason === 'string'
    ) {
      return 'execute_command'
    }
  } catch {
    return undefined
  }

  return undefined
}

export function resolveStreamedToolName(
  deltaName: string | null | undefined,
  existingName: string | undefined,
  args: string
): string {
  const explicitName = nonEmptyString(deltaName)
  if (explicitName) return explicitName

  const inferredName = inferToolNameFromArguments(args)
  if (inferredName) return inferredName

  const previousName = nonEmptyString(existingName)
  return previousName && previousName !== 'unknown' ? previousName : 'unknown'
}

export class ProviderStreamCollector {
  constructor(private readonly options: AgentProcessorOptions) {}

  async streamWithRetry(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice: ToolChoice
  ): Promise<StreamResult> {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          agentRunStore.updateRun(this.options.run.id, { status: 'retrying' })
        }
        const result = await this.streamAssistant(messages, tools, toolChoice)
        agentRunStore.updateRun(this.options.run.id, { status: 'running' })
        return result
      } catch (error) {
        const normalized = normalizeAgentError(error)
        const part = agentRunStore.createPart({
          runId: this.options.run.id,
          type: 'error',
          status: normalized.retryable && attempt < maxAttempts ? 'completed' : 'error',
          error: normalized.message,
          metadata: { kind: normalized.kind, retryable: normalized.retryable, attempt },
          startedAt: Date.now(),
          endedAt: Date.now()
        })

        if (!normalized.retryable || attempt >= maxAttempts) {
          if (normalized.kind === 'abort') {
            agentRunStore.updateRun(this.options.run.id, {
              status: 'cancelled',
              error: normalized.message,
              usage: { ...this.options.provider.getSessionUsage() },
              completedAt: Date.now()
            })
          } else {
            agentRunStore.completeRun(this.options.run.id, {
              error: normalized.message,
              usage: { ...this.options.provider.getSessionUsage() }
            })
          }
          throw error
        }

        logger.warn('ProviderStreamCollector', `Retrying provider call after ${normalized.kind}`, {
          runId: this.options.run.id,
          partId: part.id,
          attempt
        })
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)))
      }
    }

    throw new Error('Provider retry loop exhausted')
  }

  recordUsage(usage: TokenUsage): void {
    if (usage.totalTokens <= 0) return
    agentRunStore.createPart({
      runId: this.options.run.id,
      type: 'usage',
      status: 'completed',
      metadata: { ...usage },
      startedAt: Date.now(),
      endedAt: Date.now()
    })
    eventBus.publish('agent:usage', {
      topicId: this.options.run.topicId,
      taskId: this.options.run.taskId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      totalTokens: usage.totalTokens,
      llmCalls: this.options.provider.getSessionUsage().llmCalls
    })
  }

  private async streamAssistant(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice: ToolChoice
  ): Promise<StreamResult> {
    const toolBuilders = new Map<number, StreamedToolCall>()
    let textPart: AgentPart | undefined
    let content = ''
    let finishReason: string | null = null
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }

    for await (const chunk of this.options.provider.stream({
      messages,
      tools,
      toolChoice,
      temperature: this.options.config.temperature ?? AGENT_TEMPERATURE,
      abortSignal: this.options.context.abort
    })) {
      if (chunk.content) {
        content += chunk.content
        if (!textPart) {
          textPart = agentRunStore.createPart({
            runId: this.options.run.id,
            type: 'text',
            status: 'running',
            role: 'assistant',
            output: content,
            startedAt: Date.now()
          })
        } else {
          agentRunStore.updatePart(textPart.id, { output: content })
        }
      }

      if (chunk.toolCalls) {
        for (const delta of chunk.toolCalls) {
          const existing = toolBuilders.get(delta.index)
          const id = nonEmptyString(delta.id) ?? existing?.id ?? `call_${uuidv4()}`
          const args = (existing?.arguments ?? '') + (delta.function?.arguments ?? '')
          const name = resolveStreamedToolName(delta.function?.name, existing?.name, args)
          let partId = existing?.partId
          if (!partId) {
            const part = agentRunStore.createPart({
              runId: this.options.run.id,
              type: 'tool',
              status: 'pending',
              role: 'tool',
              toolName: name,
              toolCallId: id,
              input: args,
              startedAt: Date.now()
            })
            partId = part.id
          } else {
            agentRunStore.updatePart(partId, {
              toolName: name,
              toolCallId: id,
              input: args
            })
          }
          toolBuilders.set(delta.index, { index: delta.index, id, name, arguments: args, partId })
        }
      }

      if (chunk.usage) usage = chunk.usage
      if (chunk.finishReason) finishReason = chunk.finishReason
    }

    if (textPart) {
      agentRunStore.updatePart(textPart.id, {
        status: 'completed',
        output: content,
        endedAt: Date.now()
      })
    }

    return {
      content,
      toolCalls: Array.from(toolBuilders.values()).map((builder) => ({
        id: builder.id,
        type: 'function' as const,
        function: {
          name: resolveStreamedToolName(undefined, builder.name, builder.arguments),
          arguments: builder.arguments
        }
      })),
      usage,
      finishReason,
      assistantPartId: textPart?.id
    }
  }
}
