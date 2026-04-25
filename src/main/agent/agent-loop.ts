import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message } from '../../shared/types'
import { MemoryManager } from '../MemoryManager'
import { commandExecutor } from '../terminal'
import { SYSTEM_PROMPT } from '../ai'
import { MAX_AGENT_TURNS } from '../constants'
import { ContextAssembler, type AssembledContext } from './context-assembler'
import type { AgentProcessorOptions } from './agent-processor-types'
import { CompactionCoordinator } from './compaction-coordinator'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import { ProviderStreamCollector } from './provider-stream-collector'
import { RunLifecycleService } from './run-lifecycle-service'
import { ToolCallExecutor } from './tool-call-executor'
import { agentRunStore } from './agent-run-store'
import { agentCheckpointStore } from './agent-checkpoint'
import type { CompactionMode } from './compaction'
import { CONTEXT_RESERVE_TOKENS, CONTEXT_WINDOW_TOKENS } from '../constants'

export class AgentLoop {
  private readonly streamCollector: ProviderStreamCollector
  private readonly toolExecutor: ToolCallExecutor
  private readonly compaction: CompactionCoordinator
  private readonly lifecycle: RunLifecycleService
  private readonly legacyEvents: LegacyAgentEventAdapter

  constructor(private readonly options: AgentProcessorOptions) {
    this.streamCollector = new ProviderStreamCollector(options)
    this.toolExecutor = new ToolCallExecutor(options)
    this.compaction = new CompactionCoordinator(options)
    this.lifecycle = new RunLifecycleService(options)
    this.legacyEvents = new LegacyAgentEventAdapter(options.run, options.context)
  }

  async process(history: Message[]): Promise<Message> {
    const { run, context, config } = this.options
    const maxTurns = config.maxSteps ?? MAX_AGENT_TURNS
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()
    const extraContext = await MemoryManager.recallRelevantContext(
      context.topicId,
      lastUserMsg?.content || ''
    )

    this.toolExecutor.reset()

    let turnMessages: ChatCompletionMessageParam[] = []
    let workingHistory = history
    let startTurn = 1
    let lastCompactionMode: CompactionMode | undefined
    let lastCompactionReport:
      | { mode: CompactionMode; beforeTokens: number; afterTokens: number }
      | undefined

    const checkpoint = this.options.resumeFromCheckpoint
      ? agentCheckpointStore.get(run.id)
      : undefined
    if (checkpoint) {
      workingHistory = checkpoint.workingHistory
      turnMessages = checkpoint.turnMessages
      this.toolExecutor.restorePendingVerifications(checkpoint.pendingVerifications)
      startTurn = checkpoint.turnCount
      lastCompactionMode = checkpoint.lastCompactionMode
    } else if (!this.options.resumeFromCheckpoint) {
      this.lifecycle.createUserPart(run, lastUserMsg)
    }

    for (let turnCount = startTurn; turnCount <= maxTurns; turnCount++) {
      const terminalContext = commandExecutor.buildTerminalContext(context.topicId)
      const assembled = this.assembleContext(
        workingHistory,
        turnMessages,
        terminalContext,
        extraContext
      )
      this.recordContextReport(assembled, turnCount, false)

      let currentMessages = assembled.messages
      if (assembled.budget.isOverflow) {
        const compacted = await this.compaction.compactHistory(workingHistory, turnMessages)
        if (compacted) {
          workingHistory = compacted.workingHistory
          turnMessages = compacted.turnMessages
          lastCompactionMode = compacted.mode
          lastCompactionReport = {
            mode: compacted.mode,
            beforeTokens: compacted.beforeTokens,
            afterTokens: compacted.afterTokens
          }
          this.saveCheckpoint(turnCount, workingHistory, turnMessages, lastCompactionMode)
          const compactedContext = this.assembleContext(
            workingHistory,
            turnMessages,
            terminalContext,
            extraContext
          )
          this.recordContextReport(compactedContext, turnCount, true, lastCompactionReport)
          currentMessages = compactedContext.messages
        }
      }

      this.saveCheckpoint(turnCount, workingHistory, turnMessages, lastCompactionMode)
      this.legacyEvents.thinking()
      this.legacyEvents.status(turnCount > 1 ? 'verifying' : 'thinking')

      const allowFinalTurnTools = this.toolExecutor.hasPendingVerification()
      const streamResult = await this.streamCollector.streamWithRetry(
        currentMessages,
        this.toolExecutor.getTools(turnCount, maxTurns, allowFinalTurnTools),
        turnCount === maxTurns && !allowFinalTurnTools ? 'none' : 'auto'
      )

      this.streamCollector.recordUsage(streamResult.usage)

      if (streamResult.toolCalls.length > 0 && turnCount === maxTurns && !allowFinalTurnTools) {
        const attemptedTools = streamResult.toolCalls
          .map((call) => call.function.name)
          .filter(Boolean)
          .join(', ')
        const screenSummary = await commandExecutor.buildTerminalScreenSummary(context.topicId)
        return this.lifecycle.failRuntimeBlocked(
          [
            `未完成：已达到最大推理轮次 (${maxTurns}步)，模型仍尝试调用工具${attemptedTools ? `：${attemptedTools}` : ''}。`,
            '为避免工具调用标记泄漏或无限循环，runtime 没有继续执行这些工具。'
          ].join('\n'),
          ['最后终端屏幕摘要：', screenSummary].join('\n'),
          streamResult.assistantPartId
        )
      }

      turnMessages.push({
        role: 'assistant',
        content: streamResult.content,
        tool_calls: streamResult.toolCalls
      })

      if (streamResult.toolCalls.length === 0) {
        if (this.toolExecutor.hasPendingVerification()) {
          if (turnCount >= maxTurns) {
            return this.lifecycle.failMaxTurns(maxTurns)
          }

          turnMessages.push({
            role: 'user',
            content: this.toolExecutor.getVerificationObservation()
          })
          this.saveCheckpoint(turnCount + 1, workingHistory, turnMessages, lastCompactionMode)
          continue
        }

        if (!streamResult.content.trim()) {
          const screenSummary = await commandExecutor.buildTerminalScreenSummary(context.topicId)
          return this.lifecycle.failRuntimeBlocked(
            '未完成：模型没有返回可用的最终回答。',
            ['最后终端屏幕摘要：', screenSummary].join('\n'),
            streamResult.assistantPartId
          )
        }

        return this.lifecycle.finish(
          run,
          streamResult.content,
          extraContext.length > 0,
          turnCount > 1,
          streamResult.assistantPartId
        )
      }

      const observations = await this.toolExecutor.executeToolCalls(streamResult.toolCalls)
      for (const observation of observations) {
        turnMessages.push(observation)
      }

      const postToolContext = this.assembleContext(
        workingHistory,
        turnMessages,
        terminalContext,
        extraContext
      )
      const autoCompacted = await this.compaction.maybeAutoCompact(
        workingHistory,
        turnMessages,
        postToolContext.budget
      )
      if (autoCompacted) {
        workingHistory = autoCompacted.workingHistory
        turnMessages = autoCompacted.turnMessages
        lastCompactionMode = autoCompacted.mode
        lastCompactionReport = {
          mode: autoCompacted.mode,
          beforeTokens: autoCompacted.beforeTokens,
          afterTokens: autoCompacted.afterTokens
        }
        const compactedContext = this.assembleContext(
          workingHistory,
          turnMessages,
          terminalContext,
          extraContext
        )
        this.recordContextReport(compactedContext, turnCount, true, lastCompactionReport)
      }
      this.saveCheckpoint(turnCount + 1, workingHistory, turnMessages, lastCompactionMode)
    }

    return this.lifecycle.failMaxTurns(maxTurns)
  }

  private assembleContext(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[],
    terminalContext: string,
    extraContext: string
  ): AssembledContext {
    return new ContextAssembler()
      .setBudget(
        this.options.contextBudget ?? {
          modelContextWindow: CONTEXT_WINDOW_TOKENS,
          reserveTokens: CONTEXT_RESERVE_TOKENS
        }
      )
      .setSystemPrompt(this.options.config.systemPrompt ?? SYSTEM_PROMPT)
      .addLayer('terminal_context', terminalContext, 80)
      .addLayer('memory_recall', extraContext, 60)
      .setHistory(workingHistory)
      .setTurnMessages(turnMessages)
      .assemble()
  }

  private recordContextReport(
    assembled: AssembledContext,
    turnCount: number,
    afterCompaction: boolean,
    compactionReport?: { mode: CompactionMode; beforeTokens: number; afterTokens: number }
  ): void {
    agentRunStore.updateRun(this.options.run.id, {
      metadata: {
        latestContextReport: {
          ...assembled.contextReport,
          turnCount,
          afterCompaction,
          compactionMode: compactionReport?.mode,
          beforeCompactionTokens: compactionReport?.beforeTokens,
          afterCompactionTokens: compactionReport?.afterTokens
        }
      }
    })
  }

  private saveCheckpoint(
    turnCount: number,
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[],
    lastCompactionMode?: CompactionMode
  ): void {
    agentCheckpointStore.save(this.options.run.id, {
      turnCount,
      workingHistory,
      turnMessages,
      pendingVerifications: this.toolExecutor.getPendingVerificationSnapshot(),
      lastCompactionMode
    })
  }
}
