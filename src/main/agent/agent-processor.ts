import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { getErrorMessage } from '../../shared/errors'
import type { AgentPart, AgentRun, Message, TaskStep, ToolResult } from '../../shared/types'
import { messageDB, taskDB, taskStepDB } from '../db'
import { logger } from '../logger'
import { MemoryManager } from '../MemoryManager'
import { commandExecutor } from '../terminal'
import { SYSTEM_PROMPT } from '../ai'
import {
  AGENT_TEMPERATURE,
  AUTO_COMPACT_THRESHOLD,
  MAX_AGENT_TURNS,
  TASK_SUMMARY_MAX_LENGTH
} from '../constants'
import type { AgentContext } from '../AgentRunner'
import { ContextAssembler } from './context-assembler'
import { compactContext } from './compaction'
import { getContextBudget } from './token-counter'
import { DoomLoopDetector, DOOM_LOOP_THRESHOLD } from './doom-loop'
import { executeGrouped } from './session-scheduler'
import { fromCommandResult, formatObservation } from '../tools/observation'
import type { ToolRegistry } from '../tools'
import type { Tool } from '../tools/tool-factory'
import type { AgentConfig } from './agent-config'
import { eventBus } from './event-bus'
import { agentRunStore } from './agent-run-store'
import { AgentPermissionEngine } from './agent-permission-engine'
import { normalizeAgentError, retryDelayMs } from './agent-error'
import type { ProviderAdapter, SessionUsage, TokenUsage } from './provider-adapter'

interface ProcessorOptions {
  run: AgentRun
  context: AgentContext
  config: AgentConfig
  toolRegistry: ToolRegistry
  provider: ProviderAdapter
  permissionEngine: AgentPermissionEngine
  persistFinalMessage: boolean
  updateTaskStatus: boolean
}

interface StreamedToolCall {
  index: number
  id: string
  name: string
  arguments: string
  partId: string
}

interface StreamResult {
  content: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
  usage: TokenUsage
  finishReason: string | null
}

export class AgentProcessor {
  private readonly doomLoop = new DoomLoopDetector()

  constructor(private readonly options: ProcessorOptions) {}

  async process(history: Message[]): Promise<Message> {
    const { run, context, config } = this.options
    const maxTurns = config.maxSteps ?? MAX_AGENT_TURNS
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()
    const extraContext = await MemoryManager.recallRelevantContext(
      context.topicId,
      lastUserMsg?.content || ''
    )

    this.doomLoop.reset()
    this.createUserPart(run, lastUserMsg)

    const turnMessages: ChatCompletionMessageParam[] = []
    let workingHistory = history

    for (let turnCount = 1; turnCount <= maxTurns; turnCount++) {
      const terminalContext = commandExecutor.buildTerminalContext(context.topicId)
      const assembled = new ContextAssembler()
        .setSystemPrompt(config.systemPrompt ?? SYSTEM_PROMPT)
        .addLayer('terminal_context', terminalContext, 80)
        .addLayer('memory_recall', extraContext, 60)
        .setHistory(workingHistory)
        .setTurnMessages(turnMessages)
        .assemble()

      let currentMessages = assembled.messages
      if (assembled.budget.isOverflow) {
        const compacted = await this.compactHistory(workingHistory, turnMessages)
        if (compacted) {
          workingHistory = compacted
          currentMessages = new ContextAssembler()
            .setSystemPrompt(config.systemPrompt ?? SYSTEM_PROMPT)
            .addLayer('terminal_context', terminalContext, 80)
            .addLayer('memory_recall', extraContext, 60)
            .setHistory(workingHistory)
            .setTurnMessages(turnMessages)
            .assemble().messages
        }
      }

      eventBus.publish('agent:thinking', { topicId: run.topicId, taskId: run.taskId })
      this.notifyLegacyStatus(turnCount > 1 ? 'verifying' : 'thinking')

      const streamResult = await this.streamWithRetry(
        currentMessages,
        this.getTools(turnCount, maxTurns),
        turnCount === maxTurns ? 'none' : 'auto'
      )

      turnMessages.push({
        role: 'assistant',
        content: streamResult.content,
        tool_calls: streamResult.toolCalls
      })

      this.recordUsage(streamResult.usage)
      await this.maybeAutoCompact(workingHistory, turnMessages)

      if (streamResult.toolCalls.length === 0) {
        return this.finish(run, streamResult.content, extraContext.length > 0, turnCount > 1)
      }

      const observations = await this.executeToolCalls(streamResult.toolCalls)
      for (const observation of observations) {
        turnMessages.push(observation)
      }
    }

    const failedSummary = `任务达到多轮推理上限 (${maxTurns}步)，未能完全解决。`
    agentRunStore.completeRun(run.id, {
      error: failedSummary,
      usage: { ...this.options.provider.getSessionUsage() }
    })
    if (this.options.updateTaskStatus) {
      taskDB.updateTask(run.taskId, { status: 'failed', summary: failedSummary })
    }

    const timeoutMsg: Message = {
      id: uuidv4(),
      topicId: run.topicId,
      runId: run.id,
      role: 'assistant',
      content: `对不起，我已达到多轮推理上限 (${maxTurns}步)，未能完全解决任务。请根据当前进度给出进一步指令。`,
      timestamp: Date.now(),
      metadata: { taskId: run.taskId, agentStatus: 'thinking' }
    }
    if (this.options.persistFinalMessage) messageDB.createMessage(timeoutMsg)
    agentRunStore.createAssistantMessagePart(run, timeoutMsg)
    this.options.context.notifyStep(timeoutMsg)
    eventBus.publish('agent:task-complete', {
      topicId: run.topicId,
      taskId: run.taskId,
      status: 'failed',
      summary: failedSummary
    })
    return timeoutMsg
  }

  private async streamWithRetry(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice: 'auto' | 'none'
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

        logger.warn('AgentProcessor', `Retrying provider call after ${normalized.kind}`, {
          runId: this.options.run.id,
          partId: part.id,
          attempt
        })
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)))
      }
    }

    throw new Error('Provider retry loop exhausted')
  }

  private async streamAssistant(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice: 'auto' | 'none'
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
          const id = delta.id ?? existing?.id ?? `call_${uuidv4()}`
          const name = delta.function?.name ?? existing?.name ?? 'unknown'
          const args = (existing?.arguments ?? '') + (delta.function?.arguments ?? '')
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
        function: { name: builder.name, arguments: builder.arguments }
      })),
      usage,
      finishReason
    }
  }

  private async executeToolCalls(
    toolCalls: ChatCompletionMessageFunctionToolCall[]
  ): Promise<ChatCompletionMessageParam[]> {
    const safeCalls: ChatCompletionMessageFunctionToolCall[] = []
    const observations: ChatCompletionMessageParam[] = []

    for (const call of toolCalls) {
      const part = this.ensureToolPart(call)
      const parsed = this.parseToolArguments(call, part)
      if (!parsed.ok) {
        observations.push({ role: 'tool', tool_call_id: call.id, content: parsed.error })
        continue
      }

      if (!this.options.permissionEngine.isToolAllowed(call.function.name)) {
        const error = `Error: Tool "${call.function.name}" is not allowed for agent "${this.options.config.name}".`
        agentRunStore.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      if (this.doomLoop.check(call.function.name, parsed.args)) {
        const error = `Doom loop detected: the tool '${call.function.name}' has been called with identical arguments ${DOOM_LOOP_THRESHOLD} times consecutively. Try a different approach or arguments.`
        agentRunStore.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        eventBus.publish('agent:doom-loop', {
          topicId: this.options.run.topicId,
          taskId: this.options.run.taskId,
          toolName: call.function.name,
          callCount: DOOM_LOOP_THRESHOLD
        })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      safeCalls.push(call)
    }

    if (safeCalls.length === 0) return observations

    this.notifyLegacyStatus('executing')
    const results = await executeGrouped(safeCalls, (call) => this.executeTool(call))
    for (const call of safeCalls) {
      const result = results.get(call.id)
      if (!result) continue
      observations.push({
        role: 'tool',
        tool_call_id: call.id,
        content: await this.formatObservation(call, result)
      })
    }

    return observations
  }

  private async executeTool(call: ChatCompletionMessageFunctionToolCall): Promise<ToolResult> {
    const part = this.ensureToolPart(call)
    const parsed = this.parseToolArguments(call, part)
    if (!parsed.ok) return { toolCallId: call.id, content: parsed.error }

    const legacyStep = this.createLegacyStep(call, part)
    this.options.context.stepId = legacyStep.id
    this.options.context.partId = part.id

    agentRunStore.updatePart(part.id, {
      status: 'running',
      input: call.function.arguments,
      startedAt: Date.now(),
      metadata: { legacyStepId: legacyStep.id }
    })
    eventBus.publish('agent:tool-call', {
      topicId: this.options.run.topicId,
      taskId: this.options.run.taskId,
      toolName: call.function.name,
      args: parsed.args
    })

    try {
      const context = this.createToolContext(part.id, legacyStep.id)
      const result = await this.options.toolRegistry.execute(
        call.function.name,
        parsed.args,
        context
      )
      const output = result.output
      const metadata = result.metadata ?? {}

      taskStepDB.updateStep(legacyStep.id, {
        status: 'completed',
        rawOutput: output,
        endedAt: Date.now(),
        metadata
      })
      agentRunStore.updatePart(part.id, {
        status: 'completed',
        output,
        endedAt: Date.now(),
        metadata
      })
      eventBus.publish('agent:tool-result', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        toolName: call.function.name,
        output: output.slice(0, 500),
        error: false
      })

      if (metadata.usage) {
        this.options.provider.mergeChildUsage(metadata.usage as SessionUsage)
      }

      return { toolCallId: call.id, content: output, metadata }
    } catch (error) {
      const message = `Error: ${getErrorMessage(error)}`
      taskStepDB.updateStep(legacyStep.id, {
        status: 'failed',
        rawOutput: message,
        endedAt: Date.now()
      })
      agentRunStore.updatePart(part.id, {
        status: 'error',
        error: message,
        endedAt: Date.now()
      })
      eventBus.publish('agent:tool-result', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        toolName: call.function.name,
        output: message.slice(0, 500),
        error: true
      })
      return { toolCallId: call.id, content: message }
    }
  }

  private createToolContext(partId: string, stepId: string): Tool.Context {
    const permissionEngine = this.options.permissionEngine
    return {
      ...this.options.context,
      runId: this.options.run.id,
      partId,
      stepId,
      agent: this.options.config.name,
      abort: this.options.context.abort ?? new AbortController().signal,
      messages: [],
      requestAuthorization: async (command, riskLevel, reason) =>
        permissionEngine.ask({
          permission: 'command',
          pattern: command,
          riskLevel,
          reason
        }),
      ask: async (request) => {
        await permissionEngine.ask({
          permission: request.permission,
          pattern: request.pattern,
          reason: `Permission required: ${request.permission} for pattern "${request.pattern}"`,
          metadata: request.metadata
        })
      },
      updatePartMetadata: (metadata) => {
        agentRunStore.appendMetadata(partId, metadata)
      },
      createChildPart: (input) =>
        agentRunStore.createPart({
          runId: this.options.run.id,
          parentPartId: partId,
          ...input
        })
    }
  }

  private ensureToolPart(call: ChatCompletionMessageFunctionToolCall): AgentPart {
    const existing = agentRunStore
      .getParts(this.options.run.id)
      .find((part) => part.toolCallId === call.id)
    if (existing) return existing
    return agentRunStore.createPart({
      runId: this.options.run.id,
      type: 'tool',
      status: 'pending',
      role: 'tool',
      toolName: call.function.name,
      toolCallId: call.id,
      input: call.function.arguments,
      startedAt: Date.now()
    })
  }

  private parseToolArguments(
    call: ChatCompletionMessageFunctionToolCall,
    part: AgentPart
  ): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
    try {
      return { ok: true, args: JSON.parse(call.function.arguments || '{}') }
    } catch (error) {
      const message = `Error: Tool "${call.function.name}" received invalid JSON arguments: ${getErrorMessage(error)}`
      agentRunStore.updatePart(part.id, { status: 'error', error: message, endedAt: Date.now() })
      return { ok: false, error: message }
    }
  }

  private createLegacyStep(call: ChatCompletionMessageFunctionToolCall, part: AgentPart): TaskStep {
    return taskStepDB.createStep({
      taskId: this.options.run.taskId,
      type: 'command',
      status: 'running',
      title: `Calling tool ${call.function.name}`,
      content: call.function.arguments,
      metadata: { runId: this.options.run.id, partId: part.id },
      startedAt: Date.now()
    })
  }

  private async formatObservation(
    call: ChatCompletionMessageFunctionToolCall,
    result: ToolResult
  ): Promise<string> {
    if (call.function.name !== 'execute_command') return result.content

    try {
      const parsed = JSON.parse(result.content)
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      const hostId = typeof args.hostId === 'string' ? args.hostId : 'unknown'
      const terminalName = typeof args.terminalName === 'string' ? args.terminalName : 'default'

      if (parsed.content !== undefined && parsed.exitCode !== undefined) {
        const observation = fromCommandResult(parsed, hostId, terminalName)
        return formatObservation(observation)
      }

      if (parsed.content && parsed.content.length > 2000) {
        return MemoryManager.distillObservation(
          typeof args.command === 'string' ? args.command : '',
          parsed.content || '',
          parsed.exitCode
        )
      }
    } catch {
      return result.content
    }

    return result.content
  }

  private async compactHistory(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[]
  ): Promise<Message[] | undefined> {
    const part = agentRunStore.createPart({
      runId: this.options.run.id,
      type: 'compaction',
      status: 'running',
      input: 'Context overflow or proactive compaction requested.',
      startedAt: Date.now()
    })
    agentRunStore.updateRun(this.options.run.id, { status: 'compacting' })

    try {
      const compactionResult = await compactContext(workingHistory)
      if (!compactionResult?.summary) {
        agentRunStore.updatePart(part.id, {
          status: 'completed',
          output: 'No compaction was needed.',
          endedAt: Date.now()
        })
        agentRunStore.updateRun(this.options.run.id, { status: 'running' })
        return undefined
      }

      const recentTurnsAsMessages: Message[] = turnMessages
        .slice(-6)
        .map((m, i) => ({
          id: `compaction_turn_${i}`,
          topicId: this.options.run.topicId,
          role: (m.role === 'tool' ? 'tool' : m.role === 'assistant' ? 'assistant' : 'user') as
            | 'tool'
            | 'assistant'
            | 'user',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: Date.now()
        }))
        .filter((m) => m.content.length > 0)

      const compactedHistory = [
        {
          id: 'compaction_summary',
          topicId: this.options.run.topicId,
          role: 'assistant' as const,
          content: compactionResult.summary,
          timestamp: Date.now()
        },
        ...recentTurnsAsMessages,
        workingHistory[workingHistory.length - 1]
      ].filter(Boolean) as Message[]

      agentRunStore.updatePart(part.id, {
        status: 'completed',
        output: compactionResult.summary,
        endedAt: Date.now(),
        metadata: {
          originalTokens: compactionResult.originalTokenEstimate,
          compactedTokens: compactionResult.compactedTokenEstimate,
          prunedCount: compactionResult.prunedCount
        }
      })
      agentRunStore.updateRun(this.options.run.id, { status: 'running' })
      eventBus.publish('agent:auto-compact', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        originalTokens: compactionResult.originalTokenEstimate,
        compactedTokens: compactionResult.compactedTokenEstimate
      })
      return compactedHistory
    } catch (error) {
      agentRunStore.updatePart(part.id, {
        status: 'error',
        error: getErrorMessage(error),
        endedAt: Date.now()
      })
      agentRunStore.updateRun(this.options.run.id, { status: 'running' })
      logger.error('AgentProcessor', 'Compaction failed', error)
      return undefined
    }
  }

  private async maybeAutoCompact(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[]
  ): Promise<void> {
    const usage = this.options.provider.getSessionUsage()
    if (usage.totalTokens <= 0) return
    const budget = getContextBudget(usage.totalTokens)
    if (budget.used / budget.usable < AUTO_COMPACT_THRESHOLD) return
    await this.compactHistory(workingHistory, turnMessages)
  }

  private recordUsage(usage: TokenUsage): void {
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

  private finish(
    run: AgentRun,
    content: string,
    memoryRecalled: boolean,
    isVerifying: boolean
  ): Message {
    this.doomLoop.reset()
    const finalContent = content || ''
    const msg: Message = {
      id: uuidv4(),
      topicId: run.topicId,
      runId: run.id,
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      metadata: {
        taskId: run.taskId,
        agentStatus: 'thinking',
        memoryRecalled,
        isVerifying
      }
    }

    if (this.options.updateTaskStatus) {
      taskDB.updateTask(run.taskId, {
        status: 'completed',
        summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
      })
      MemoryManager.reflectOnTask(run.taskId).catch((err) => {
        logger.error('AgentProcessor', 'Failed to trigger reflection:', err)
      })
    }

    if (this.options.persistFinalMessage) messageDB.createMessage(msg)
    agentRunStore.createAssistantMessagePart(run, msg)
    agentRunStore.completeRun(run.id, { usage: { ...this.options.provider.getSessionUsage() } })
    this.options.context.notifyStep(msg)
    eventBus.publish('agent:task-complete', {
      topicId: run.topicId,
      taskId: run.taskId,
      status: 'completed',
      summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
    })
    return msg
  }

  private createUserPart(run: AgentRun, userMessage?: Message): void {
    if (!userMessage) return
    agentRunStore.createPart({
      runId: run.id,
      messageId: userMessage.id,
      type: 'text',
      status: 'completed',
      role: 'user',
      output: userMessage.content,
      startedAt: userMessage.timestamp,
      endedAt: userMessage.timestamp
    })
  }

  private getTools(turnCount: number, maxTurns: number): ChatCompletionTool[] {
    if (turnCount === maxTurns) return []
    return this.options.toolRegistry
      .getFilteredDefinitions(this.options.config.name)
      .filter((tool) => this.options.permissionEngine.isToolAllowed(tool.function.name))
  }

  private notifyLegacyStatus(status: 'thinking' | 'executing' | 'verifying'): void {
    this.options.context.notifyStep({
      id: uuidv4(),
      topicId: this.options.run.topicId,
      runId: this.options.run.id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      metadata: {
        taskId: this.options.run.taskId,
        agentStatus: status
      }
    })
  }
}
