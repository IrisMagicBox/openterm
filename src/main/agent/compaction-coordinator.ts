import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'
import { logger } from '../logger'
import { AUTO_COMPACT_THRESHOLD } from '../constants'
import { compactContext } from './compaction'
import { selectTailMessages } from './compaction-policy'
import { getContextBudget } from './token-counter'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions } from './agent-processor-types'
import { AgentPartWriter } from './agent-part-writer'

export class CompactionCoordinator {
  private readonly parts = new AgentPartWriter()

  constructor(private readonly options: AgentProcessorOptions) {}

  async maybeAutoCompact(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[]
  ): Promise<Message[] | undefined> {
    if (turnMessages.length === 0) return undefined
    const usage = this.options.provider.getSessionUsage()
    if (usage.totalTokens <= 0) return undefined
    const budget = getContextBudget(usage.totalTokens)
    if (budget.used / budget.usable < AUTO_COMPACT_THRESHOLD) return undefined
    return this.compactHistory(workingHistory, turnMessages, { auto: true })
  }

  async compactHistory(
    workingHistory: Message[],
    _turnMessages: ChatCompletionMessageParam[],
    opts: { auto?: boolean } = {}
  ): Promise<Message[] | undefined> {
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
      const compactionResult = await compactContext(workingHistory)
      if (!compactionResult?.summary) {
        this.parts.updatePart(part.id, {
          status: 'completed',
          output: 'No compaction was needed.',
          endedAt: Date.now(),
          metadata: compactionResult
            ? {
                auto: opts.auto === true,
                originalTokens: compactionResult.originalTokenEstimate,
                compactedTokens: compactionResult.compactedTokenEstimate,
                prunedCount: compactionResult.prunedCount,
                prunedTokens: compactionResult.prunedTokens,
                tailStartMessageId: compactionResult.tailStartMessageId,
                tailMessageCount: compactionResult.tailMessageCount,
                pruneOnly: compactionResult.prunedCount > 0
              }
            : { auto: opts.auto === true, skipped: true }
        })
        agentRunStore.updateRun(this.options.run.id, { status: 'running' })
        return undefined
      }

      const tail = selectTailMessages(workingHistory)
      const compactedHistory = [
        {
          id: 'compaction_summary',
          topicId: this.options.run.topicId,
          role: 'assistant' as const,
          content: compactionResult.summary,
          timestamp: Date.now()
        },
        ...tail.messages
      ].filter(Boolean) as Message[]

      this.parts.updatePart(part.id, {
        status: 'completed',
        output: compactionResult.summary,
        endedAt: Date.now(),
        metadata: {
          auto: opts.auto === true,
          originalTokens: compactionResult.originalTokenEstimate,
          compactedTokens: compactionResult.compactedTokenEstimate,
          prunedCount: compactionResult.prunedCount,
          prunedTokens: compactionResult.prunedTokens,
          tailStartMessageId: compactionResult.tailStartMessageId,
          tailMessageCount: compactionResult.tailMessageCount,
          droppedHistoryMessages: tail.droppedCount
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
}
