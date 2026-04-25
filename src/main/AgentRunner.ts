import { WebContents } from 'electron'
import { Message, Host, TerminalSessionRole } from '../shared/types'
import { getAgentConfig } from './agent/agent-config'
import { eventBus } from './agent/event-bus'
import { AgentRuntime, type AgentRuntimeOptions } from './agent/agent-runtime'
import type { SessionUsage } from './agent/provider-adapter'

export interface AuthResponse {
  approved: boolean
  alwaysAllow: boolean
}

/** Interface for the agent service methods used by tools via AgentContext */
export interface IAgentService {
  getSessions(topicId: string): Promise<import('./agent').AgentSession[]>
  createTerminal(
    topicId: string,
    hostId: string,
    name?: string,
    options?: { role?: TerminalSessionRole }
  ): Promise<import('./agent').AgentSession>
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
  ensureSession: (
    hostId: string,
    hostAlias: string,
    name?: string,
    options?: { role?: TerminalSessionRole; visible?: boolean }
  ) => Promise<string>
  requestAuthorization: (
    command: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    reason: string,
    metadata?: Record<string, unknown>
  ) => Promise<AuthResponse>
  notifyStep: (message: Message) => void
  metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
  stepId?: string
  runId?: string
  partId?: string
  parentRunId?: string
  parentPartId?: string
  /** Request permission for an action */
  ask?: (request: {
    permission: string
    pattern: string
    always?: boolean
    metadata?: Record<string, unknown>
  }) => Promise<void>
  /** Abort signal for cancellation */
  abort?: AbortSignal
  /** Message history for context */
  messages?: Array<{ role: string; content: string }>
  /** Current agent name */
  agent?: string
}

export class AgentRunner {
  private readonly runtime: AgentRuntime
  private readonly agentName: string

  private static readonly RISK_LEVELS: Record<string, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  }

  constructor(
    private readonly context: AgentContext,
    agentName = 'build',
    options: Omit<AgentRuntimeOptions, 'agentName'> = {}
  ) {
    this.agentName = agentName
    this.context.agentName = agentName
    this.context.agent = agentName
    eventBus.setWebContents(context.webContents)
    this.applyAgentRiskPolicy()
    if (!this.context.metadata) this.context.metadata = () => {}
    this.runtime = new AgentRuntime(context, { ...options, agentName })
  }

  async run(history: Message[]): Promise<Message> {
    return this.runtime.run(history)
  }

  getSessionUsage(): SessionUsage {
    return this.runtime.getSessionUsage()
  }

  private applyAgentRiskPolicy(): void {
    const config = getAgentConfig(this.agentName)
    const originalRequestAuth = this.context.requestAuthorization.bind(this.context)
    this.context.requestAuthorization = async (command, riskLevel, reason, metadata) => {
      const permission = config.permissions.find(
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
      return originalRequestAuth(command, riskLevel, reason, metadata)
    }
  }
}
