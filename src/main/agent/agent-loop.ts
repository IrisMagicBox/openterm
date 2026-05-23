import type { Message } from '../../shared/types'
import { MemoryManager } from '../MemoryManager'
import { commandExecutor } from '../terminal'
import { SYSTEM_PROMPT } from '../ai'
import { MAX_AGENT_TURNS } from '../constants'
import { ContextAssembler, type AssembledContext } from './context-assembler'
import type { AgentProcessorOptions } from './agent-processor-types'
import { CompactionCoordinator } from './compaction-coordinator'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import { ProviderStreamCollector, ProviderStreamError } from './provider-stream-collector'
import { RunLifecycleService } from './run-lifecycle-service'
import { ToolCallExecutor } from './tool-call-executor'
import { agentRunStore } from './agent-run-store'
import { agentCheckpointStore } from './agent-checkpoint'
import type { CompactionMode } from './compaction'
import { CONTEXT_RESERVE_TOKENS, CONTEXT_WINDOW_TOKENS } from '../constants'
import { AgentRunState } from './agent-run-state'
import { ToolCallLedger } from './tool-call-ledger'

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

    let state = new AgentRunState({ workingHistory: history })
    let startTurn = 1
    let lastCompactionReport:
      | { mode: CompactionMode; beforeTokens: number; afterTokens: number }
      | undefined
    let emptyAssistantResponseCount = 0

    const checkpoint = this.options.resumeFromCheckpoint
      ? agentCheckpointStore.get(run.id)
      : undefined
    if (checkpoint) {
      state = new AgentRunState(checkpoint.state)
      this.toolExecutor.restorePendingVerifications(state.pendingVerifications)
      startTurn = state.turnCount
    } else if (!this.options.resumeFromCheckpoint) {
      this.lifecycle.createUserPart(run, lastUserMsg)
    }

    const persistedParts = agentRunStore.getParts(run.id)
    const recoveredAssistantEvents = state.hydrateLatestAssistantTurnFromParts(persistedParts)
    const recoveredToolResults = state.reconcileToolResultsFromParts(persistedParts)
    if (recoveredAssistantEvents > 0 || recoveredToolResults > 0) {
      this.saveCheckpoint(state)
    }

    const latestAssistantTurn = state.getLatestAssistantTurn()
    if (latestAssistantTurn) {
      startTurn = Math.max(
        startTurn,
        latestAssistantTurn.completed ? latestAssistantTurn.turn + 1 : latestAssistantTurn.turn
      )
    }
    state.turnCount = startTurn

    for (let turnCount = startTurn; turnCount <= maxTurns; turnCount++) {
      if (this.options.context.abort?.aborted) {
        return this.finishAborted(state, turnCount)
      }

      const terminalContext = commandExecutor.buildTerminalContext(context.topicId)
      const pendingAssistantTurn = state.getPendingAssistantTurn()
      const pendingTurn = turnCount === pendingAssistantTurn?.turn ? pendingAssistantTurn : undefined

      if (pendingTurn && pendingTurn.toolCalls.length > 0) {
        const executedObservations = await this.toolExecutor.executeToolCalls(pendingTurn.toolCalls)
        if (this.options.context.abort?.aborted) {
          return this.finishAborted(state, turnCount)
        }
        const observationsByCallId = new Map(
          executedObservations.map((observation) => [observation.tool_call_id, observation])
        )
        for (const call of pendingTurn.toolCalls) {
          const observation = observationsByCallId.get(call.id)
          if (!observation) continue
          state.replaceToolCallSnapshot(observation.tool_call_id, observation.call, observation.args)
          const signature = ToolCallLedger.signatureFor(observation.toolName, observation.args)
          state.appendToolResult({
            turn: turnCount,
            toolCallId: observation.tool_call_id,
            toolName: observation.toolName,
            signature,
            content: observation.content,
            observation: observation.content
          })
        }
        state.setPendingVerifications(this.toolExecutor.getPendingVerificationSnapshot())
        this.saveCheckpoint(state)
        state.turnCount = turnCount + 1
        this.saveCheckpoint(state)
        continue
      }

      const assembled = this.assembleContext(
        state,
        terminalContext,
        extraContext
      )
      this.recordContextReport(assembled, turnCount, false)

      let currentMessages = assembled.messages
      if (assembled.budget.isOverflow) {
        const compacted = await this.compaction.compactHistory(
          state.toRuntimeMessages(run.id, run.topicId, run.taskId)
        )
        if (compacted) {
          state.setCompactedHistory(compacted.workingHistory, compacted.mode)
          lastCompactionReport = {
            mode: compacted.mode,
            beforeTokens: compacted.beforeTokens,
            afterTokens: compacted.afterTokens
          }
          state.turnCount = turnCount
          this.saveCheckpoint(state)
          const compactedContext = this.assembleContext(
            state,
            terminalContext,
            extraContext
          )
          this.recordContextReport(compactedContext, turnCount, true, lastCompactionReport)
          currentMessages = compactedContext.messages
        }
      }

      state.turnCount = turnCount
      this.saveCheckpoint(state)
      this.legacyEvents.thinking()
      this.legacyEvents.status(turnCount > 1 ? 'verifying' : 'thinking')

      const allowFinalTurnTools = this.toolExecutor.hasPendingVerification()
      const streamResult = await (async () => {
        try {
          return await this.streamCollector.streamWithRetry(
            currentMessages,
            this.toolExecutor.getTools(turnCount, maxTurns, allowFinalTurnTools),
            turnCount === maxTurns && !allowFinalTurnTools ? 'none' : 'auto'
          )
        } catch (error) {
          if (error instanceof ProviderStreamError) {
            state.appendError(turnCount, error.message)
            this.saveCheckpoint(state)
            return this.lifecycle.failProviderInterrupted(
              error.message,
              error.partial,
              error.kind === 'abort' ? 'aborted' : 'provider_error',
              error.kind === 'abort' ? 'abort' : 'provider'
            )
          }
          throw error
        }
      })()

      if ('role' in streamResult) {
        return streamResult
      }

      this.streamCollector.recordUsage(streamResult.usage)

      state.appendAssistantResponse({
        turn: turnCount,
        content: streamResult.content,
        toolCalls: streamResult.toolCalls,
        assistantPartId: streamResult.assistantPartId
      })

      if (streamResult.toolCalls.length === 0) {
        if (!streamResult.content.trim()) {
          emptyAssistantResponseCount += 1
          if (emptyAssistantResponseCount === 1 && turnCount < maxTurns) {
            state.appendRuntimeObservation(
              turnCount,
              '[Runtime observation] 上一轮模型没有输出正文，也没有请求工具。请基于已有观察继续推进：如果还需要信息，请调用合适工具；如果已经有足够证据，请给出简洁最终回答。'
            )
            state.turnCount = turnCount + 1
            this.saveCheckpoint(state)
            continue
          }

          const errorContent =
            '未完成：模型连续没有返回可用正文，也没有请求工具。已保留上方已完成的过程记录，请继续补充指令。'
          state.appendError(turnCount, errorContent)
          this.saveCheckpoint(state)
          return this.lifecycle.failRuntimeBlocked(
            errorContent,
            undefined,
            streamResult.assistantPartId
          )
        }

        emptyAssistantResponseCount = 0
        state.appendFinal(turnCount, streamResult.content)
        this.saveCheckpoint(state)
        return this.lifecycle.finish(
          run,
          streamResult.content,
          extraContext.length > 0,
          turnCount > 1,
          streamResult.assistantPartId
        )
      }

      emptyAssistantResponseCount = 0
      const parsedCalls = streamResult.toolCalls.map((call) => ({
        call,
        args: this.safeParseToolArgs(call.function.arguments)
      }))
      const attempts = state.ledger.registerAttempts(parsedCalls, turnCount)
      const executedObservations = await this.toolExecutor.executeToolCalls(attempts)
      if (this.options.context.abort?.aborted) {
        return this.finishAborted(state, turnCount)
      }
      const observationsByCallId = new Map(
        executedObservations.map((observation) => [observation.tool_call_id, observation])
      )

      const observations = streamResult.toolCalls
        .map((call) => observationsByCallId.get(call.id))
        .filter((observation): observation is NonNullable<typeof observation> => !!observation)

      for (const observation of observations) {
        state.replaceToolCallSnapshot(observation.tool_call_id, observation.call, observation.args)
        const signature = ToolCallLedger.signatureFor(observation.toolName, observation.args)
        state.appendToolResult({
          turn: turnCount,
          toolCallId: observation.tool_call_id,
          toolName: observation.toolName,
          signature,
          content: observation.content,
          observation: observation.content
        })
      }
      state.setPendingVerifications(this.toolExecutor.getPendingVerificationSnapshot())
      this.saveCheckpoint(state)

      const postToolContext = this.assembleContext(
        state,
        terminalContext,
        extraContext
      )
      const autoCompacted = await this.compaction.maybeAutoCompact(
        state.toRuntimeMessages(run.id, run.topicId, run.taskId),
        postToolContext.budget
      )
      if (autoCompacted) {
        state.setCompactedHistory(autoCompacted.workingHistory, autoCompacted.mode)
        lastCompactionReport = {
          mode: autoCompacted.mode,
          beforeTokens: autoCompacted.beforeTokens,
          afterTokens: autoCompacted.afterTokens
        }
        const compactedContext = this.assembleContext(
          state,
          terminalContext,
          extraContext
        )
        this.recordContextReport(compactedContext, turnCount, true, lastCompactionReport)
      }
      state.turnCount = turnCount + 1
      this.saveCheckpoint(state)
    }

    state.appendError(maxTurns, `任务达到多轮推理上限 (${maxTurns}步)，未能完全解决。`)
    this.saveCheckpoint(state)
    return this.lifecycle.failMaxTurns(maxTurns)
  }

  private assembleContext(
    state: AgentRunState,
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
      .setHistory(state.workingHistory)
      .setTurnMessages(state.toModelMessages())
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

  private saveCheckpoint(state: AgentRunState): void {
    agentCheckpointStore.save(this.options.run.id, {
      state: state.snapshot()
    })
  }

  private finishAborted(state: AgentRunState, turnCount: number): Message {
    state.reconcileToolResultsFromParts(agentRunStore.getParts(this.options.run.id))
    state.appendError(turnCount, 'aborted')
    this.saveCheckpoint(state)
    return this.lifecycle.failProviderInterrupted('aborted', undefined, 'aborted', 'abort')
  }

  private safeParseToolArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || '{}') as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
}
