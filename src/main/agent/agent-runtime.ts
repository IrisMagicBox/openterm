import type { Message } from '../../shared/types'
import { resolveProviderSelection } from '../ai'
import { CONTEXT_RESERVE_TOKENS, CONTEXT_WINDOW_TOKENS } from '../constants'
import type { AgentContext } from '../AgentRunner'
import { createDefaultRegistry, ToolRegistry } from '../tools'
import { getAgentConfig, type AgentConfig } from './agent-config'
import { AgentPermissionEngine } from './agent-permission-engine'
import { AgentProcessor } from './agent-processor'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import { ProviderAdapter, type SessionUsage } from './provider-adapter'

export interface AgentRuntimeOptions {
  agentName?: string
  runId?: string
  parentRunId?: string
  parentPartId?: string
  persistFinalMessage?: boolean
  updateTaskStatus?: boolean
  goal?: string
  metadata?: Record<string, unknown>
  resumeFromCheckpoint?: boolean
  contextBudget?: {
    modelContextWindow: number
    reserveTokens: number
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class AgentRuntime {
  private readonly agentName: string
  private readonly config: AgentConfig
  private readonly toolRegistry: ToolRegistry
  private readonly provider: ProviderAdapter
  private readonly toolsReady: Promise<void>

  constructor(
    private readonly context: AgentContext,
    private readonly options: AgentRuntimeOptions = {}
  ) {
    this.agentName = options.agentName ?? context.agentName ?? 'build'
    this.config = getAgentConfig(this.agentName)
    this.context.agentName = this.agentName
    this.context.agent = this.agentName
    this.toolRegistry = createDefaultRegistry()
    this.provider = new ProviderAdapter({ topicId: context.topicId })
    this.toolsReady = this.toolRegistry.initializeTools(this.agentName)
    eventBus.setWebContents(context.webContents)
  }

  async run(history: Message[]): Promise<Message> {
    await this.toolsReady
    const selection = resolveProviderSelection({ topicId: this.context.topicId })
    const contextBudget = this.options.contextBudget ?? {
      modelContextWindow: selection.capabilities.contextWindow || CONTEXT_WINDOW_TOKENS,
      reserveTokens: selection.capabilities.maxOutputTokens
        ? clamp(selection.capabilities.maxOutputTokens, 2048, 8192)
        : CONTEXT_RESERVE_TOKENS
    }
    const run =
      (this.options.runId ? agentRunStore.getRun(this.options.runId) : undefined) ??
      agentRunStore.createRun({
        id: this.options.runId,
        topicId: this.context.topicId,
        taskId: this.context.taskId,
        parentRunId: this.options.parentRunId,
        parentPartId: this.options.parentPartId,
        agentName: this.agentName,
        mode: this.config.mode === 'hidden' ? 'hidden' : this.config.mode,
        status: 'running',
        goal: this.options.goal ?? history.filter((m) => m.role === 'user').pop()?.content ?? '',
        providerId: selection.provider.id,
        modelId: selection.modelId,
        metadata: this.options.metadata
      })

    this.context.runId = run.id
    this.context.parentRunId = run.parentRunId
    this.context.parentPartId = run.parentPartId

    const permissionEngine = new AgentPermissionEngine(this.config, this.context)
    const processor = new AgentProcessor({
      run,
      context: this.context,
      config: this.config,
      toolRegistry: this.toolRegistry,
      provider: this.provider,
      permissionEngine,
      persistFinalMessage: this.options.persistFinalMessage ?? !run.parentRunId,
      updateTaskStatus: this.options.updateTaskStatus ?? !run.parentRunId,
      resumeFromCheckpoint: this.options.resumeFromCheckpoint,
      contextBudget
    })

    return processor.process(history)
  }

  getSessionUsage(): SessionUsage {
    return this.provider.getSessionUsage()
  }
}
