import type { WebContents } from 'electron'
import type { AgentRun, Host, Message } from '../shared/types'
import type { IAgentService } from './AgentRunner'
import { AgentApplicationService } from './agent/agent-application-service'
import { AgentIpcController } from './agent/agent-ipc-controller'
import { AgentSessionManager } from './agent/agent-session-manager'
import { ApprovalBroker } from './agent/approval-broker'
import type { AgentSession, CreateAgentSessionFn } from './agent/agent-service-types'

export type { AgentSession } from './agent/agent-service-types'

export class AgentService implements IAgentService {
  private readonly sessions = new AgentSessionManager()
  private readonly approvals = new ApprovalBroker()
  private readonly application = new AgentApplicationService(
    this.sessions,
    this.approvals,
    () => this
  )
  private readonly ipc = new AgentIpcController(this)

  setWebContents(webContents: WebContents): void {
    this.sessions.setWebContents(webContents)
    this.approvals.setWebContents(webContents)
    this.application.setWebContents(webContents)
  }

  setCreateAgentSession(fn: CreateAgentSessionFn | null): void {
    this.sessions.setCreateAgentSession(fn)
  }

  registerIPC(): void {
    this.ipc.register()
  }

  getTopicHosts(topicId: string): Promise<(Host | undefined)[]> {
    return this.sessions.getTopicHosts(topicId)
  }

  async addHostToTopic(topicId: string, hostId: string): Promise<boolean> {
    await this.sessions.addHostToTopic(topicId, hostId)
    return true
  }

  async removeHostFromTopic(topicId: string, hostId: string): Promise<boolean> {
    await this.sessions.removeHostFromTopic(topicId, hostId)
    return true
  }

  createTerminal(topicId: string, hostId: string, name?: string): Promise<AgentSession> {
    return this.sessions.createTerminal(topicId, hostId, name)
  }

  closeTerminal(id: string): Promise<void> {
    return this.sessions.closeTerminal(id)
  }

  renameTerminal(id: string, name: string): Promise<void> {
    return this.sessions.renameTerminal(id, name)
  }

  toggleTerminalPin(id: string, isPinned: boolean): Promise<void> {
    return this.sessions.toggleTerminalPin(id, isPinned)
  }

  updateHostMetadata(
    hostId: string,
    metadata: Partial<Pick<Host, 'alias' | 'tags'>>
  ): Promise<void> {
    return this.sessions.updateHostMetadata(hostId, metadata)
  }

  searchTopics(query: string): Promise<unknown[]> {
    return this.sessions.searchTopics(query)
  }

  searchMemories(query: string, hostId?: string, topicId?: string): Promise<unknown[]> {
    return this.sessions.searchMemories(query, hostId, topicId)
  }

  getSessions(topicId: string): Promise<AgentSession[]> {
    return this.sessions.getSessions(topicId)
  }

  registerSession(session: AgentSession): Promise<void> {
    return this.sessions.registerSession(session)
  }

  handleMessage(topicId: string, content: string): Promise<Message> {
    return this.application.handleMessage(topicId, content)
  }

  cancelRun(runId: string): Promise<AgentRun | undefined> {
    return this.application.cancelRun(runId)
  }

  resumeRun(runId: string): Promise<Message> {
    return this.application.resumeRun(runId)
  }

  handleAuthResponse(requestId: string, approved: boolean, alwaysAllow = false): Promise<void> {
    return this.approvals.handleAuthResponse(requestId, approved, alwaysAllow)
  }

  setPaused(id: string, paused: boolean): Promise<void> {
    return this.sessions.setPaused(id, paused)
  }

  isPaused(id: string): Promise<boolean> {
    return this.sessions.isPaused(id)
  }
}

export const agentService = new AgentService()

export function setCreateAgentSession(fn: CreateAgentSessionFn | null): void {
  agentService.setCreateAgentSession(fn)
}

export function setupAgentHandlers(): void {
  agentService.registerIPC()
}
