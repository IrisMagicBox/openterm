import { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall
} from 'openai/resources/chat/completions/completions'
import { messageDB, taskDB, taskStepDB } from './db'
import { getErrorMessage } from '../shared/errors'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { Message, TaskStep, ToolResult, Host } from '../shared/types'
import { AgentSession } from './agent'
import { SYSTEM_PROMPT } from './ai'
import { getAgentConfig, type AgentConfig } from './agent/agent-config'
import { MemoryManager } from './MemoryManager'
import {
  MAX_AGENT_TURNS,
  AGENT_TEMPERATURE,
  TASK_SUMMARY_MAX_LENGTH,
  AUTO_COMPACT_THRESHOLD
} from './constants'
import { createDefaultRegistry, ToolRegistry } from './tools'
import { DoomLoopDetector, DOOM_LOOP_THRESHOLD } from './agent/doom-loop'
import { ContextAssembler } from './agent/context-assembler'
import { eventBus } from './agent/event-bus'
import { compactContext } from './agent/compaction'
import { fromCommandResult, formatObservation } from './tools/observation'
import { executeGrouped } from './agent/session-scheduler'
import { ProviderAdapter, type SessionUsage } from './agent/provider-adapter'
import { getContextBudget } from './agent/token-counter'

export interface AuthResponse {
  approved: boolean
  alwaysAllow: boolean
}

/** Interface for the agent service methods used by tools via AgentContext */
export interface IAgentService {
  getSessions(topicId: string): Promise<AgentSession[]>
  createTerminal(topicId: string, hostId: string, name?: string): Promise<AgentSession>
  closeTerminal(id: string): Promise<void>
  renameTerminal(id: string, name: string): Promise<void>
  updateHostMetadata(hostId: string, metadata: Record<string, unknown>): Promise<void>
  searchTopics(query: string): Promise<unknown[]>
  searchMemories(query: string, hostId?: string, topicId?: string): Promise<unknown[]>
  getTopicHosts(topicId: string): Promise<(Host | undefined)[]>
}

export interface AgentContext {
  topicId: string
  taskId: string
  agentName?: string
  webContents: WebContents
  agentService: IAgentService
  ensureSession: (hostId: string, hostAlias: string, name?: string) => Promise<string>
  requestAuthorization: (
    command: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    reason: string
  ) => Promise<AuthResponse>
  notifyStep: (message: Message) => void
  metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
  stepId?: string
}

export class AgentRunner {
  private context: AgentContext
  private agentName: string
  private toolRegistry: ToolRegistry
  private doomLoop: DoomLoopDetector
  private config: AgentConfig
  private provider: ProviderAdapter

  private static readonly RISK_LEVELS: Record<string, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  }

  constructor(context: AgentContext, agentName: string = 'build') {
    this.context = context
    this.agentName = agentName
    this.context.agentName = agentName
    this.toolRegistry = createDefaultRegistry()
    this.doomLoop = new DoomLoopDetector()
    this.config = getAgentConfig(agentName)
    this.provider = new ProviderAdapter()

    // Wire EventBus to renderer
    eventBus.setWebContents(context.webContents)

    const originalRequestAuth = context.requestAuthorization.bind(context)
    this.context.requestAuthorization = async (command, riskLevel, reason) => {
      const permission = this.config.permissions.find(
        (p) => p.tool === '*' || p.tool === 'execute_command'
      )
      const maxRisk = permission?.maxAutoApproveRisk
      if (maxRisk !== undefined) {
        const maxLevel = AgentRunner.RISK_LEVELS[maxRisk] ?? 0
        const requestedLevel = AgentRunner.RISK_LEVELS[riskLevel] ?? 3
        if (requestedLevel > maxLevel) {
          return { approved: false, alwaysAllow: false }
        }
      }
      return originalRequestAuth(command, riskLevel, reason)
    }

    if (!this.context.metadata) {
      this.context.metadata = () => {}
    }
  }

  async run(history: Message[]): Promise<Message> {
    const config = this.config
    let turnCount = 0
    const maxTurns = config.maxSteps ?? MAX_AGENT_TURNS

    // Recall relevant context
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()
    const extraContext = await MemoryManager.recallRelevantContext(
      this.context.topicId,
      lastUserMsg?.content || ''
    )

    // Reset doom loop detector for new run
    this.doomLoop.reset()

    const turnMessages: ChatCompletionMessageParam[] = []

    // Working copy of history that may be compacted
    let workingHistory = history

    while (turnCount < maxTurns) {
      turnCount++

      // REBUILD context in each turn to ensure state consistency
      const terminalContext = commandExecutor.buildTerminalContext(this.context.topicId)

      // Assemble context using ContextAssembler with priority-based layering
      const assembled = new ContextAssembler()
        .setSystemPrompt(config.systemPrompt ?? SYSTEM_PROMPT)
        .addLayer('terminal_context', terminalContext, 80)
        .addLayer('memory_recall', extraContext, 60)
        .setHistory(workingHistory)
        .setTurnMessages(turnMessages)
        .assemble()

      let currentMessages = assembled.messages

      // Compaction safety net: if context is still too large after assembly,
      // generate an LLM summary and rebuild with compacted history
      if (assembled.budget.isOverflow) {
        try {
          const compactionResult = await compactContext(workingHistory)
          if (compactionResult && compactionResult.summary) {
            logger.info('AgentRunner', 'Compacting context', {
              originalTokens: compactionResult.originalTokenEstimate,
              compactedTokens: compactionResult.compactedTokenEstimate,
              prunedCount: compactionResult.prunedCount
            })

            // Rebuild with compacted history: summary + recent turn results + last user message
            // Preserve recent turnMessages context so the agent doesn't lose track mid-task
            const recentTurnsAsMessages: Message[] = turnMessages
              .slice(-6)
              .map((m, i) => ({
                id: `compaction_turn_${i}`,
                topicId: this.context.topicId,
                role: (m.role === 'tool'
                  ? 'tool'
                  : m.role === 'assistant'
                    ? 'assistant'
                    : 'user') as Message['role'],
                content: typeof m.content === 'string' ? m.content : '',
                timestamp: Date.now()
              }))
              .filter((m) => m.content.length > 0)

            const compactedHistory: Message[] = [
              {
                id: 'compaction_summary',
                topicId: this.context.topicId,
                role: 'assistant' as const,
                content: compactionResult.summary,
                timestamp: Date.now()
              },
              ...recentTurnsAsMessages,
              workingHistory[workingHistory.length - 1]
            ].filter(Boolean)

            workingHistory = compactedHistory

            const reassembled = new ContextAssembler()
              .setSystemPrompt(config.systemPrompt ?? SYSTEM_PROMPT)
              .addLayer('terminal_context', terminalContext, 80)
              .addLayer('memory_recall', extraContext, 60)
              .setHistory(compactedHistory)
              .setTurnMessages(turnMessages)
              .assemble()

            currentMessages = reassembled.messages
          }
        } catch (err) {
          logger.error('AgentRunner', 'Compaction failed, proceeding with assembled context', err)
        }
      }

      // Determine if we are likely in a verification phase based on previous turn
      const lastAssistantMsg =
        turnMessages.length > 0 ? turnMessages[turnMessages.length - 1] : null
      const isVerifying: boolean =
        turnCount > 1 ||
        Boolean(
          lastAssistantMsg?.content &&
          typeof lastAssistantMsg.content === 'string' &&
          (lastAssistantMsg.content.toLowerCase().includes('验证') ||
            lastAssistantMsg.content.toLowerCase().includes('verify') ||
            lastAssistantMsg.content.toLowerCase().includes('check'))
        )

      // Notify UI we are thinking (keep existing notifyStep for current UI)
      this.context.notifyStep({
        id: uuidv4(),
        topicId: this.context.topicId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          taskId: this.context.taskId,
          agentStatus: isVerifying ? 'verifying' : 'thinking'
        }
      })

      // Also publish via EventBus
      if (isVerifying) {
        eventBus.publish('agent:step', {
          topicId: this.context.topicId,
          taskId: this.context.taskId,
          stepId: this.context.stepId,
          role: 'assistant',
          content: '',
          agentStatus: 'verifying'
        })
      } else {
        eventBus.publish('agent:thinking', {
          topicId: this.context.topicId,
          taskId: this.context.taskId
        })
      }

      const chatResult = await this.provider.chat({
        messages: currentMessages,
        tools: this.getTools(),
        toolChoice: turnCount === maxTurns ? 'none' : 'auto',
        temperature: config.temperature ?? AGENT_TEMPERATURE
      })

      const assistantMessage: ChatCompletionMessageParam = {
        role: 'assistant',
        content: chatResult.content,
        tool_calls: chatResult.toolCalls
      }
      turnMessages.push(assistantMessage)

      // Auto-compact: proactively compact when accumulated usage reaches threshold
      const sessionUsage = this.provider.getSessionUsage()
      if (sessionUsage.totalTokens > 0) {
        const budget = getContextBudget(sessionUsage.totalTokens)
        if (budget.used / budget.usable >= AUTO_COMPACT_THRESHOLD) {
          try {
            const compactionResult = await compactContext(workingHistory)
            if (compactionResult && compactionResult.summary) {
              logger.info('AgentRunner', 'Auto-compacting context (proactive)', {
                usageRatio: (budget.used / budget.usable).toFixed(2),
                originalTokens: compactionResult.originalTokenEstimate,
                compactedTokens: compactionResult.compactedTokenEstimate
              })

              const recentTurnsAsMessages: Message[] = turnMessages
                .slice(-6)
                .map((m, i) => ({
                  id: `compaction_turn_${i}`,
                  topicId: this.context.topicId,
                  role: (m.role === 'tool'
                    ? 'tool'
                    : m.role === 'assistant'
                      ? 'assistant'
                      : 'user') as Message['role'],
                  content: typeof m.content === 'string' ? m.content : '',
                  timestamp: Date.now()
                }))
                .filter((m) => m.content.length > 0)

              workingHistory = [
                {
                  id: 'compaction_summary',
                  topicId: this.context.topicId,
                  role: 'assistant' as const,
                  content: compactionResult.summary,
                  timestamp: Date.now()
                },
                ...recentTurnsAsMessages,
                workingHistory[workingHistory.length - 1]
              ].filter(Boolean)

              eventBus.publish('agent:auto-compact', {
                topicId: this.context.topicId,
                taskId: this.context.taskId,
                originalTokens: compactionResult.originalTokenEstimate,
                compactedTokens: compactionResult.compactedTokenEstimate
              })
            }
          } catch (err) {
            logger.error('AgentRunner', 'Auto-compaction failed', err)
          }
        }

        eventBus.publish('agent:usage', {
          topicId: this.context.topicId,
          taskId: this.context.taskId,
          inputTokens: chatResult.usage.inputTokens,
          outputTokens: chatResult.usage.outputTokens,
          cachedTokens: chatResult.usage.cachedTokens,
          totalTokens: chatResult.usage.totalTokens,
          llmCalls: sessionUsage.llmCalls
        })
      }

      if (!chatResult.toolCalls || chatResult.toolCalls.length === 0) {
        // Agent produced a final text response — reset doom loop
        this.doomLoop.reset()

        const finalContent =
          typeof assistantMessage.content === 'string'
            ? assistantMessage.content
            : (JSON.stringify(assistantMessage.content) ?? '')
        const msg: Message = {
          id: uuidv4(),
          topicId: this.context.topicId,
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
          metadata: {
            taskId: this.context.taskId,
            agentStatus: 'thinking',
            memoryRecalled: extraContext.length > 0,
            isVerifying: isVerifying
          }
        }

        // 1. Update task status to completed
        taskDB.updateTask(this.context.taskId, {
          status: 'completed',
          summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
        })

        // 2. Trigger asynchronous reflection
        MemoryManager.reflectOnTask(this.context.taskId).catch((err) => {
          logger.error('AgentRunner', 'Failed to trigger reflection:', err)
        })

        messageDB.createMessage(msg)
        this.context.notifyStep(msg)

        // Publish task-complete event
        eventBus.publish('agent:task-complete', {
          topicId: this.context.topicId,
          taskId: this.context.taskId,
          status: 'completed',
          summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
        })

        return msg
      }

      // Execute tools with host-grouped scheduling (same-host sequential, different-host parallel)
      const toolCalls = (chatResult.toolCalls || []) as ChatCompletionMessageFunctionToolCall[]

      // Pre-check doom loop for all calls before executing any
      const safeCalls: ChatCompletionMessageFunctionToolCall[] = []
      for (const tc of toolCalls) {
        const toolName = tc.function.name
        let toolArgs: Record<string, unknown>
        try {
          toolArgs = JSON.parse(tc.function.arguments)
        } catch {
          toolArgs = {}
        }

        if (this.doomLoop.check(toolName, toolArgs)) {
          const doomMsg = `Doom loop detected: the tool '${toolName}' has been called with identical arguments ${DOOM_LOOP_THRESHOLD} times consecutively. Try a different approach or arguments.`
          logger.warn('AgentRunner', doomMsg, { toolName, toolArgs })
          eventBus.publish('agent:doom-loop', {
            topicId: this.context.topicId,
            taskId: this.context.taskId,
            toolName,
            callCount: DOOM_LOOP_THRESHOLD
          })
          turnMessages.push({ role: 'tool', tool_call_id: tc.id, content: doomMsg })
        } else {
          safeCalls.push(tc)
        }
      }

      if (safeCalls.length > 0) {
        this.context.notifyStep({
          id: uuidv4(),
          topicId: this.context.topicId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          metadata: { taskId: this.context.taskId, agentStatus: 'executing' }
        })
        eventBus.publish('agent:step', {
          topicId: this.context.topicId,
          taskId: this.context.taskId,
          stepId: this.context.stepId,
          role: 'tool',
          content: '',
          agentStatus: 'executing'
        })

        const results = await executeGrouped(safeCalls, async (tc) => {
          const toolName = tc.function.name
          let toolArgs: Record<string, unknown>
          try {
            toolArgs = JSON.parse(tc.function.arguments)
          } catch {
            toolArgs = {}
          }
          eventBus.publish('agent:tool-call', {
            topicId: this.context.topicId,
            taskId: this.context.taskId,
            toolName,
            args: toolArgs
          })
          return this.executeTool(tc)
        })

        // Process results: format observations, merge subagent usage, publish events
        for (const tc of safeCalls) {
          const result = results.get(tc.id)
          if (!result) continue

          const toolName = tc.function.name
          let toolArgs: Record<string, unknown>
          try {
            toolArgs = JSON.parse(tc.function.arguments)
          } catch {
            toolArgs = {}
          }

          eventBus.publish('agent:tool-result', {
            topicId: this.context.topicId,
            taskId: this.context.taskId,
            toolName,
            output: result.content.slice(0, 500),
            error: result.content.startsWith('Error:')
          })

          // Aggregate subagent usage back into parent session
          if (toolName === 'task' && result.metadata?.usage) {
            this.provider.mergeChildUsage(result.metadata.usage as SessionUsage)
          }

          // Format tool results for the agent's next turn
          let observation = result.content
          if (toolName === 'execute_command') {
            try {
              const parsed = JSON.parse(result.content)
              const hostId = (toolArgs as Record<string, unknown>).hostId as string | undefined
              const terminalName = (toolArgs as Record<string, unknown>).terminalName as
                | string
                | undefined

              if (parsed.content !== undefined && parsed.exitCode !== undefined) {
                const structObs = fromCommandResult(
                  parsed,
                  hostId ?? 'unknown',
                  terminalName ?? 'default'
                )
                observation = formatObservation(structObs)
              }

              if (parsed.content && parsed.content.length > 2000) {
                observation = await MemoryManager.distillObservation(
                  (toolArgs as Record<string, unknown>).command as string,
                  parsed.content || '',
                  parsed.exitCode
                )
              }
            } catch (e) {
              // Fallback if parsing fails
            }
          }

          turnMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: observation
          })
        }
      }
    }

    // Update task status to failed (max turns reached)
    const failedSummary = `任务达到多轮推理上限 (${maxTurns}步)，未能完全解决。`
    taskDB.updateTask(this.context.taskId, {
      status: 'failed',
      summary: failedSummary
    })

    // Fallback if max turns reached
    const timeoutMsg: Message = {
      id: uuidv4(),
      topicId: this.context.topicId,
      role: 'assistant',
      content: `对不起，我已达到多轮推理上限 (${maxTurns}步)，未能完全解决任务。请根据当前进度给出进一步指令。`,
      timestamp: Date.now(),
      metadata: {
        taskId: this.context.taskId,
        agentStatus: 'thinking'
      }
    }
    messageDB.createMessage(timeoutMsg)
    this.context.notifyStep(timeoutMsg)

    // Publish task-complete event
    eventBus.publish('agent:task-complete', {
      topicId: this.context.topicId,
      taskId: this.context.taskId,
      status: 'failed',
      summary: failedSummary
    })

    return timeoutMsg
  }

  private getTools(): ChatCompletionTool[] {
    return this.toolRegistry.getFilteredDefinitions(this.agentName)
  }

  private async executeTool(toolCall: ChatCompletionMessageFunctionToolCall): Promise<ToolResult> {
    const { name, arguments: argsJson } = toolCall.function
    const args = JSON.parse(argsJson)

    const step: TaskStep = {
      id: uuidv4(),
      taskId: this.context.taskId,
      type: 'command',
      status: 'running',
      title: `Calling tool ${name}`,
      content: argsJson,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    taskStepDB.createStep(step)

    try {
      this.context.stepId = step.id
      const result = await this.toolRegistry.execute(
        name,
        args,
        this.context as import('./tools/tool-factory').Tool.Context
      )

      const resultString = result.output
      taskStepDB.updateStep(step.id, { status: 'completed', rawOutput: resultString })
      return { toolCallId: toolCall.id, content: resultString, metadata: result.metadata }
    } catch (error: unknown) {
      taskStepDB.updateStep(step.id, { status: 'failed', rawOutput: getErrorMessage(error) })
      return { toolCallId: toolCall.id, content: `Error: ${getErrorMessage(error)}` }
    }
  }

  getSessionUsage(): SessionUsage {
    return this.provider.getSessionUsage()
  }
}
