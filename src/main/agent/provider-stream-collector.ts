import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import type { AgentPart } from '../../shared/types'
import { stripInternalToolCallMarkup } from '../../shared/internal-tool-call-markup'
import { logger } from '../logger'
import { AGENT_TEMPERATURE } from '../constants'
import { agentRunStore } from './agent-run-store'
import { normalizeAgentError, retryDelayMs } from './agent-error'
import type { AgentErrorKind } from './agent-error'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions, StreamResult, ToolChoice } from './agent-processor-types'
import type { TokenUsage } from './provider-adapter'
import { AgentPartProjection } from './agent-part-projection'

interface StreamedToolCall {
  index: number
  id: string
  name: string
  arguments: string
  partId: string
}

export interface PartialStreamState {
  textPartId?: string
  content: string
}

export class ProviderStreamError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly partial: PartialStreamState,
    readonly kind: AgentErrorKind,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'ProviderStreamError'
  }
}

export interface ExtractedXmlToolCalls {
  content: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
}

interface ResolvedExtractedToolName {
  name: string
  invalidToolName?: string
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

function stripToolNamespace(toolName: string): string {
  return toolName.trim().replace(/^functions?\./i, '')
}

function resolveExtractedToolName(
  toolName: string,
  registeredToolNames?: Set<string>
): ResolvedExtractedToolName {
  const normalized = stripToolNamespace(toolName)
  if (!registeredToolNames) return { name: normalized }
  if (registeredToolNames.has(normalized)) return { name: normalized }

  const lower = normalized.toLowerCase()
  if (registeredToolNames.has(lower)) return { name: lower }

  return { name: 'invalid_tool', invalidToolName: normalized }
}

function invalidToolArguments(
  invalidToolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...args,
    tool: invalidToolName,
    error: `Unknown tool "${invalidToolName}".`
  }
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function parseTextToolCallName(header: string): string {
  const firstToken = header.trim().split(/\s+/)[0] ?? ''
  const withoutCallIndex = firstToken.split(':')[0] ?? firstToken
  return stripToolNamespace(withoutCallIndex)
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

    const resolved = resolveExtractedToolName(toolName, registeredToolNames)
    const finalArgs = resolved.invalidToolName
      ? invalidToolArguments(resolved.invalidToolName, args)
      : args

    toolCalls.push({
      id: `call_xml_${uuidv4()}`,
      type: 'function',
      function: {
        name: resolved.name,
        arguments: JSON.stringify(finalArgs)
      }
    })

    return ''
  })

  cleaned = cleaned.replace(/<\/[A-Za-z0-9_-]+:tool_call>/gi, '').trim()
  return { content: cleaned, toolCalls }
}

export function extractTextToolCalls(
  rawContent: string,
  registeredToolNames?: Set<string>
): ExtractedXmlToolCalls {
  const toolCalls: ChatCompletionMessageFunctionToolCall[] = []

  const replaceToolCalls = (value: string): { content: string; count: number } => {
    const before = toolCalls.length
    const pattern =
      /<tool_call_begin>\s*([^<]*?)\s*<tool_call_argument_begin>\s*([\s\S]*?)\s*<tool_call_end>/gi
    const content = value.replace(pattern, (_fullMatch, header: string, rawArgs: string) => {
      const toolName = parseTextToolCallName(header)
      const resolved = resolveExtractedToolName(toolName, registeredToolNames)
      const args = rawArgs.trim()
      const finalArgs = resolved.invalidToolName
        ? JSON.stringify(
            invalidToolArguments(
              resolved.invalidToolName,
              parseJsonObject(args) ?? { rawArgs: args }
            )
          )
        : args || '{}'

      toolCalls.push({
        id: `call_text_${uuidv4()}`,
        type: 'function',
        function: {
          name: resolved.name,
          arguments: finalArgs
        }
      })

      return ''
    })
    return { content, count: toolCalls.length - before }
  }

  const sectionPattern = /<tool_calls_section_begin>\s*([\s\S]*?)\s*<tool_calls_section_end>/gi
  let cleaned = rawContent.replace(sectionPattern, (fullMatch, body: string) => {
    const replaced = replaceToolCalls(body)
    if (replaced.count === 0) return fullMatch
    return replaced.content.trim() ? replaced.content : ''
  })

  cleaned = replaceToolCalls(cleaned).content
  cleaned = cleaned
    .replace(/<tool_calls_section_(?:begin|end)>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { content: cleaned, toolCalls }
}

export class ProviderStreamCollector {
  private readonly parts = new AgentPartProjection()
  private lastPartial: PartialStreamState | undefined

  constructor(private readonly options: AgentProcessorOptions) {}

  getLastPartial(): PartialStreamState | undefined {
    return this.lastPartial
  }

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
        const part =
          normalized.kind === 'abort'
            ? undefined
            : this.parts.createAssistantErrorPart({
                runId: this.options.run.id,
                error: normalized.message,
                metadata: { kind: normalized.kind, retryable: normalized.retryable, attempt }
              })
        if (part && normalized.retryable && attempt < maxAttempts) {
          this.parts.updatePart(part.id, { status: 'completed' })
        }

        if (!normalized.retryable || attempt >= maxAttempts) {
          if (normalized.kind === 'abort') {
            this.parts.closeOpenParts(this.options.run.id, {
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
            this.parts.closeOpenParts(this.options.run.id, {
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
          partId: part?.id,
          attempt
        })
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)))
      }
    }

    throw new Error('Provider retry loop exhausted')
  }

  recordUsage(usage: TokenUsage): void {
    if (usage.totalTokens <= 0) return
    this.parts.recordUsage({
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

    try {
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
            textPart = this.parts.createAssistantTextPart({
              runId: this.options.run.id,
              output: content
            })
          } else {
            this.parts.updatePart(textPart.id, { output: content })
          }
          this.lastPartial = { textPartId: textPart.id, content }
        }

        if (chunk.toolCalls) {
          for (const delta of chunk.toolCalls) {
            const existing = toolBuilders.get(delta.index)
            const id = nonEmptyString(delta.id) ?? existing?.id ?? `call_${uuidv4()}`
            const args = (existing?.arguments ?? '') + (delta.function?.arguments ?? '')
            const name = resolveStreamedToolName(delta.function?.name, existing?.name, args)
            let partId = existing?.partId
            if (!partId) {
              const part = this.parts.createToolCallPart({
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
    } catch (error) {
      const normalized = normalizeAgentError(error)
      const reason = `Provider stream interrupted: ${normalized.message}`
      const endedAt = Date.now()
      const cleanedPartial = stripInternalToolCallMarkup(content)

      if (textPart) {
        this.parts.updatePart(textPart.id, {
          status: 'error',
          output: cleanedPartial || content,
          error: normalized.message,
          endedAt,
          metadata: {
            interrupted: true,
            kind: normalized.kind,
            retryable: normalized.retryable
          }
        })
      }

      for (const builder of toolBuilders.values()) {
        this.parts.updatePart(builder.partId, {
          status: 'error',
          error: reason,
          endedAt,
          metadata: {
            interrupted: true,
            kind: normalized.kind,
            retryable: normalized.retryable
          }
        })
      }

      this.lastPartial = textPart
        ? { textPartId: textPart.id, content: cleanedPartial || content }
        : undefined
      throw new ProviderStreamError(
        normalized.message,
        error,
        this.lastPartial ?? { content: '' },
        normalized.kind,
        normalized.retryable
      )
    }

    const registeredToolNames = this.getRegisteredToolNames()
    const extractedXml = extractXmlToolCalls(content, registeredToolNames)
    const extractedText = extractTextToolCalls(extractedXml.content, registeredToolNames)
    const extractedToolCalls = [...extractedXml.toolCalls, ...extractedText.toolCalls]
    content = extractedText.content

    if (textPart) {
      this.lastPartial = { textPartId: textPart.id, content }
      this.parts.updatePart(textPart.id, {
        status: 'completed',
        output: content,
        endedAt: Date.now(),
        metadata:
          extractedToolCalls.length > 0
            ? {
                ...(extractedXml.toolCalls.length > 0 ? { extractedXmlToolCalls: true } : {}),
                ...(extractedText.toolCalls.length > 0 ? { extractedTextToolCalls: true } : {})
              }
            : undefined
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
      toolCalls: [...streamedToolCalls, ...extractedToolCalls],
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
