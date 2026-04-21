import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message } from '../../shared/types'
import { getErrorMessage } from '../../shared/errors'
import { logger } from '../logger'
import { AUTO_COMPACT_THRESHOLD } from '../constants'
import { compactContext } from './compaction'
import { getContextBudget } from './token-counter'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import type { AgentProcessorOptions } from './agent-processor-types'

export class CompactionCoordinator {
  constructor(private readonly options: AgentProcessorOptions) {}

  async maybeAutoCompact(
    workingHistory: Message[],
    turnMessages: ChatCompletionMessageParam[]
  ): Promise<void> {
    const usage = this.options.provider.getSessionUsage()
    if (usage.totalTokens <= 0) return
    const budget = getContextBudget(usage.totalTokens)
    if (budget.used / budget.usable < AUTO_COMPACT_THRESHOLD) return
    await this.compactHistory(workingHistory, turnMessages)
  }

  async compactHistory(
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
      logger.error('CompactionCoordinator', 'Compaction failed', error)
      return undefined
    }
  }
}
