import type { Message } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'
import { logger } from '../logger'
import { AUTO_COMPACT_THRESHOLD } from '../constants'
import { compactContext, type CompactionMode } from './compaction'
import type { ContextBudget } from './token-counter'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions } from './agent-processor-types'
import { AgentPartProjection } from './agent-part-projection'

export interface RuntimeCompactionResult {
  workingHistory: Message[]
  mode: CompactionMode
  beforeTokens: number
  afterTokens: number
}

export class CompactionCoordinator {
  private readonly parts = new AgentPartProjection()

  constructor(private readonly options: AgentProcessorOptions) {}

  async maybeAutoCompact(
    runtimeMessages: Message[],
    budget: ContextBudget
  ): Promise<RuntimeCompactionResult | undefined> {
    if (runtimeMessages.length === 0) return undefined
    if (budget.used / budget.usable < AUTO_COMPACT_THRESHOLD) return undefined
    return this.compactHistory(runtimeMessages, { auto: true, force: true })
  }

  async compactHistory(
    runtimeMessages: Message[],
    opts: { auto?: boolean; force?: boolean } = {}
  ): Promise<RuntimeCompactionResult | undefined> {
    const part = this.parts.createCompactionPart({
      runId: this.options.run.id,
      input: 'Context overflow or proactive compaction requested.',
      metadata: { auto: opts.auto === true },
      startedAt: Date.now()
    })
    agentRunStore.updateRun(this.options.run.id, { status: 'compacting' })

    try {
      const compactionResult = await compactContext(runtimeMessages, {
        ...(this.options.contextBudget ?? {}),
        force: opts.force
      })
      if (compactionResult.mode === 'none') {
        this.parts.completeCompactionPart(part.id, {
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

      this.parts.completeCompactionPart(part.id, {
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
          absorbedTurnMessages: runtimeMessages.length
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
        mode: compactionResult.mode,
        beforeTokens: compactionResult.originalTokenEstimate,
        afterTokens: compactionResult.compactedTokenEstimate
      }
    } catch (error) {
      this.parts.failCompactionPart(part.id, {
        error: getErrorMessage(error),
        endedAt: Date.now()
      })
      agentRunStore.updateRun(this.options.run.id, { status: 'running' })
      logger.error('CompactionCoordinator', 'Compaction failed', error)
      return undefined
    }
  }
}
