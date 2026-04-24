import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageFunctionToolCall,
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
import { AgentPartWriter } from './agent-part-writer'

interface StreamedToolCall {
  index: number
  id: string
  name: string
  arguments: string
  partId: string
}

export interface ExtractedXmlToolCalls {
  content: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
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

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function coerceXmlParameter(value: string): unknown {
  const decoded = decodeXmlText(value).trim()
  if (decoded === 'true') return true
  if (decoded === 'false') return false
  if (decoded === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(decoded)) return Number(decoded)
  if (
    (decoded.startsWith('{') && decoded.endsWith('}')) ||
    (decoded.startsWith('[') && decoded.endsWith(']'))
  ) {
    try {
      return JSON.parse(decoded) as unknown
    } catch {
      return decoded
    }
  }
  return decoded
}

export function extractXmlToolCalls(
  rawContent: string,
  registeredToolNames?: Set<string>
): ExtractedXmlToolCalls {
  const toolCalls: ChatCompletionMessageFunctionToolCall[] = []
  let cleaned = rawContent
  const invokePattern =
    /<invoke\s+name=(["'])([^"']+)\1\s*>([\s\S]*?)<\/invoke>\s*(?:<\/[A-Za-z0-9_-]+:tool_call>)?/gi

  cleaned = cleaned.replace(invokePattern, (_fullMatch, _quote: string, toolName: string, body) => {
    const args: Record<string, unknown> = {}
    const parameterPattern = /<parameter\s+name=(["'])([^"']+)\1\s*>([\s\S]*?)<\/parameter>/gi
    let parameterMatch: RegExpExecArray | null
    while ((parameterMatch = parameterPattern.exec(body)) !== null) {
      args[parameterMatch[2]] = coerceXmlParameter(parameterMatch[3])
    }

    const normalizedToolName = (() => {
      if (!registeredToolNames) return toolName
      if (registeredToolNames.has(toolName)) return toolName
      const lower = toolName.toLowerCase()
      if (registeredToolNames.has(lower)) return lower
      args.tool = toolName
      args.error = `Unknown tool "${toolName}".`
      return 'invalid_tool'
    })()

    toolCalls.push({
      id: `call_xml_${toolCalls.length}`,
      type: 'function',
      function: {
        name: normalizedToolName,
        arguments: JSON.stringify(args)
      }
    })

    return ''
  })

  cleaned = cleaned.replace(/<\/[A-Za-z0-9_-]+:tool_call>/gi, '').trim()
  return { content: cleaned, toolCalls }
}

export class ProviderStreamCollector {
  private readonly parts = new AgentPartWriter()

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
        const part = this.parts.createErrorPart({
          runId: this.options.run.id,
          error: normalized.message,
          metadata: { kind: normalized.kind, retryable: normalized.retryable, attempt },
          role: 'assistant'
        })
        if (normalized.retryable && attempt < maxAttempts) {
          this.parts.updatePart(part.id, { status: 'completed' })
        }

        if (!normalized.retryable || attempt >= maxAttempts) {
          if (normalized.kind === 'abort') {
            this.parts.finishOpenParts(this.options.run.id, {
              status: 'cancelled',
              reason: normalized.message,
              metadata: { stopReason: 'aborted' }
            })
            agentRunStore.updateRun(this.options.run.id, {
              status: 'cancelled',
              error: normalized.message,
              usage: { ...this.options.provider.getSessionUsage(), stopReason: 'aborted' },
              completedAt: Date.now()
            })
          } else {
            this.parts.finishOpenParts(this.options.run.id, {
              status: 'error',
              reason: normalized.message,
              metadata: { stopReason: 'provider_error' }
            })
            agentRunStore.completeRun(this.options.run.id, {
              error: normalized.message,
              usage: { ...this.options.provider.getSessionUsage(), stopReason: 'provider_error' }
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
    this.parts.createUsagePart({
      runId: this.options.run.id,
      metadata: { ...usage }
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
          textPart = this.parts.createTextPart({
            runId: this.options.run.id,
            role: 'assistant',
            output: content
          })
        } else {
          this.parts.updatePart(textPart.id, { output: content })
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
            const part = this.parts.createToolPart({
              runId: this.options.run.id,
              toolName: name,
              toolCallId: id,
              input: args
            })
            partId = part.id
          } else {
            this.parts.updatePart(partId, {
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

    const registeredToolNames = this.getRegisteredToolNames()
    const extractedXml = extractXmlToolCalls(content, registeredToolNames)
    content = extractedXml.content

    if (textPart) {
      this.parts.updatePart(textPart.id, {
        status: 'completed',
        output: content,
        endedAt: Date.now(),
        metadata: extractedXml.toolCalls.length > 0 ? { extractedXmlToolCalls: true } : undefined
      })
    }

    const streamedToolCalls = Array.from(toolBuilders.values()).map((builder) => ({
      id: builder.id,
      type: 'function' as const,
      function: {
        name: resolveStreamedToolName(undefined, builder.name, builder.arguments),
        arguments: builder.arguments
      }
    }))

    return {
      content,
      toolCalls: [...streamedToolCalls, ...extractedXml.toolCalls],
      usage,
      finishReason,
      assistantPartId: textPart?.id
    }
  }

  private getRegisteredToolNames(): Set<string> {
    return new Set(
      this.options.toolRegistry
        .getFilteredDefinitions(this.options.config.name)
        .filter((tool) => this.options.permissionEngine.isToolAllowed(tool.function.name))
        .map((tool) => tool.function.name)
    )
  }
}
