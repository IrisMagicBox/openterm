import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'
import { logger } from '../logger'
import { AUTO_COMPACT_THRESHOLD } from '../constants'
import { compactContext, type CompactionMode } from './compaction'
import type { ContextBudget } from './token-counter'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions } from './agent-processor-types'
import { AgentPartWriter } from './agent-part-writer'

export interface RuntimeCompactionResult {
  workingHistory: Message[]
  turnMessages: ChatCompletionMessageParam[]
  mode: CompactionMode
  beforeTokens: number
  afterTokens: number
}

export class CompactionCoordinator {
  private readonly parts = new AgentPartWriter()

  constructor(private readonly options: AgentProcessorOptions) {}

  async maybeAutoCompact(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[],
    budget: ContextBudget
  ): Promise<RuntimeCompactionResult | undefined> {
    if (turnMessages.length === 0) return undefined
    if (budget.used / budget.usable < AUTO_COMPACT_THRESHOLD) return undefined
    return this.compactHistory(workingHistory, turnMessages, { auto: true, force: true })
  }

  async compactHistory(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[],
    opts: { auto?: boolean; force?: boolean } = {}
  ): Promise<RuntimeCompactionResult | undefined> {
    const part = this.parts.createPart({
      runId: this.options.run.id,
      type: 'compaction',
      status: 'running',
      input: 'Context overflow or proactive compaction requested.',
      metadata: { auto: opts.auto === true },
      startedAt: Date.now()
    })
    agentRunStore.updateRun(this.options.run.id, { status: 'compacting' })

    try {
      const runtimeMessages = this.mergeRuntimeMessages(workingHistory, turnMessages)
      const compactionResult = await compactContext(runtimeMessages, {
        ...(this.options.contextBudget ?? {}),
        force: opts.force
      })
      if (compactionResult.mode === 'none') {
        this.parts.updatePart(part.id, {
          status: 'completed',
          output: 'No compaction was needed.',
          endedAt: Date.now(),
          metadata: {
            auto: opts.auto === true,
            mode: compactionResult.mode,
            originalTokens: compactionResult.originalTokenEstimate,
            compactedTokens: compactionResult.compactedTokenEstimate,
            prunedCount: compactionResult.prunedCount,
            prunedTokens: compactionResult.prunedTokens,
            tailStartMessageId: compactionResult.tailStartMessageId,
            tailMessageCount: compactionResult.tailMessageCount,
            skipped: true
          }
        })
        agentRunStore.updateRun(this.options.run.id, { status: 'running' })
        return undefined
      }

      const compactedHistory = compactionResult.compactedMessages.map((message, index) => ({
        ...message,
        id:
          message.id ||
          (index === 0 && compactionResult.mode === 'summary'
            ? 'compaction_summary'
            : `compaction_${Date.now()}_${index}`),
        topicId: message.topicId || this.options.run.topicId,
        timestamp: message.timestamp || Date.now()
      }))

      this.parts.updatePart(part.id, {
        status: 'completed',
        output:
          compactionResult.summary ||
          `Pruned ${compactionResult.prunedCount} tool output(s) without summarization.`,
        endedAt: Date.now(),
        metadata: {
          auto: opts.auto === true,
          mode: compactionResult.mode,
          originalTokens: compactionResult.originalTokenEstimate,
          compactedTokens: compactionResult.compactedTokenEstimate,
          prunedCount: compactionResult.prunedCount,
          prunedTokens: compactionResult.prunedTokens,
          tailStartMessageId: compactionResult.tailStartMessageId,
          tailMessageCount: compactionResult.tailMessageCount,
          absorbedTurnMessages: turnMessages.length
        }
      })
      agentRunStore.updateRun(this.options.run.id, { status: 'running' })
      eventBus.publish('agent:auto-compact', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        originalTokens: compactionResult.originalTokenEstimate,
        compactedTokens: compactionResult.compactedTokenEstimate
      })
      return {
        workingHistory: compactedHistory,
        turnMessages: [],
        mode: compactionResult.mode,
        beforeTokens: compactionResult.originalTokenEstimate,
        afterTokens: compactionResult.compactedTokenEstimate
      }
    } catch (error) {
      this.parts.updatePart(part.id, {
        status: 'error',
        error: getErrorMessage(error),
        endedAt: Date.now()
      })
      agentRunStore.updateRun(this.options.run.id, { status: 'running' })
      logger.error('CompactionCoordinator', 'Compaction failed', error)
      return undefined
    }
  }

  private mergeRuntimeMessages(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[]
  ): Message[] {
    if (turnMessages.length === 0) return workingHistory
    const now = Date.now()
    return [
      ...workingHistory,
      ...turnMessages.map((message, index) => this.toRuntimeMessage(message, now + index))
    ]
  }

  private toRuntimeMessage(message: ChatCompletionMessageParam, timestamp: number): Message {
    const record = message as unknown as Record<string, unknown>
    const role =
      record.role === 'tool' ? 'tool' : record.role === 'assistant' ? 'assistant' : 'user'
    return {
      id: `turn_${this.options.run.id}_${timestamp}`,
      topicId: this.options.run.topicId,
      runId: this.options.run.id,
      role,
      content: this.messageContentToString(record.content),
      timestamp,
      toolCalls: Array.isArray(record.tool_calls)
        ? (record.tool_calls as Message['toolCalls'])
        : undefined,
      toolCallId: typeof record.tool_call_id === 'string' ? record.tool_call_id : undefined,
      name: typeof record.name === 'string' ? record.name : undefined,
      metadata: { taskId: this.options.run.taskId }
    }
  }

  private messageContentToString(content: unknown): string {
    if (typeof content === 'string') return content
    if (content == null) return ''
    return JSON.stringify(content)
  }
}
