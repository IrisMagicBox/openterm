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
    this.lifecycle.createUserPart(run, lastUserMsg)

    const turnMessages: ChatCompletionMessageParam[] = []
    let workingHistory = history

    for (let turnCount = 1; turnCount <= maxTurns; turnCount++) {
      const terminalContext = commandExecutor.buildTerminalContext(context.topicId)
      const assembled = this.assembleContext(
        workingHistory,
        turnMessages,
        terminalContext,
        extraContext
      )

      let currentMessages = assembled.messages
      if (assembled.budget.isOverflow) {
        const compacted = await this.compaction.compactHistory(workingHistory, turnMessages)
        if (compacted) {
          workingHistory = compacted
          currentMessages = this.assembleContext(
            workingHistory,
            turnMessages,
            terminalContext,
            extraContext
          ).messages
        }
      }

      this.legacyEvents.thinking()
      this.legacyEvents.status(turnCount > 1 ? 'verifying' : 'thinking')

      const streamResult = await this.streamCollector.streamWithRetry(
        currentMessages,
        this.toolExecutor.getTools(turnCount, maxTurns),
        turnCount === maxTurns ? 'none' : 'auto'
      )

      turnMessages.push({
        role: 'assistant',
        content: streamResult.content,
        tool_calls: streamResult.toolCalls
      })

      this.streamCollector.recordUsage(streamResult.usage)
      await this.compaction.maybeAutoCompact(workingHistory, turnMessages)

      if (streamResult.toolCalls.length === 0) {
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
      .setSystemPrompt(this.options.config.systemPrompt ?? SYSTEM_PROMPT)
      .addLayer('terminal_context', terminalContext, 80)
      .addLayer('memory_recall', extraContext, 60)
      .setHistory(workingHistory)
      .setTurnMessages(turnMessages)
      .assemble()
  }
}
