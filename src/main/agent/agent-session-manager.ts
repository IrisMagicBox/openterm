import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { hostDB, memoryDB, terminalSessionDB, topicDB } from '../db'
import { commandExecutor } from '../terminal'
import { createLocalSession } from '../local-terminal'
import type {
  AgentSession,
  CloseTerminalSessionFn,
  CreateAgentSessionFn
} from './agent-service-types'
import type { TerminalSessionDeletedBy, TerminalSessionRole } from '../../shared/types'

export class AgentSessionManager {
  private webContents?: WebContents
  private createAgentSessionRef: CreateAgentSessionFn | null = null
  private closeTerminalSessionRef: CloseTerminalSessionFn | null = null
  private topicSessions: Map<string, Map<string, AgentSession[]>> = new Map()

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  setCreateAgentSession(fn: CreateAgentSessionFn | null): void {
    this.createAgentSessionRef = fn
  }

  setCloseTerminalSession(fn: CloseTerminalSessionFn | null): void {
    this.closeTerminalSessionRef = fn
  }

  async getTopicHosts(topicId: string): Promise<Array<ReturnType<typeof hostDB.getHostById>>> {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return []
    return Promise.all(topic.hostIds.map((id) => hostDB.getHostById(id)))
  }

  async addHostToTopic(topicId: string, hostId: string): Promise<void> {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return
    if (!topic.hostIds.includes(hostId)) {
      topicDB.updateTopicHosts(topicId, [...topic.hostIds, hostId])
    }
  }

  async removeHostFromTopic(topicId: string, hostId: string): Promise<void> {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return
    topicDB.updateTopicHosts(
      topicId,
      topic.hostIds.filter((id) => id !== hostId)
    )

    const hostMap = this.topicSessions.get(topicId)
    const sessions = [...(hostMap?.get(hostId) ?? [])]
    if (sessions.length === 0) return
    for (const session of sessions) {
      await this.closeTerminal(session.id, { deletedBy: 'system' })
    }
    hostMap?.delete(hostId)
  }

  async createTerminal(
    topicId: string,
    hostId: string,
    name?: string,
    options: { role?: TerminalSessionRole } = {}
  ): Promise<AgentSession> {
    const host = hostDB.getHostById(hostId)
    if (!host) throw new Error('Host not found')
    return this.createNewSession(topicId, hostId, host.alias, name, true, options.role ?? 'user')
  }

  async closeTerminal(
    id: string,
    options: { deletedBy?: TerminalSessionDeletedBy } = {}
  ): Promise<void> {
    const deletedBy = options.deletedBy ?? 'agent'
    const session = this.findSession(id) ?? terminalSessionDB.getSessionById(id)
    const physicallyClosed = session
      ? this.closeTerminalSessionRef?.({ id: session.id, hostId: session.hostId }, deletedBy)
      : false

    if (!physicallyClosed) {
      commandExecutor.closeSession(id, deletedBy)
    }

    this.removeSession(id)
    this.webContents?.send('agent:session-closed', { id })
  }

  async renameTerminal(id: string, name: string): Promise<void> {
    const session = this.findSession(id)
    if (session) {
      session.name = name
      this.webContents?.send('agent:session-created', this.withControlState(session))
    }
    terminalSessionDB.updateSessionName(id, name)
  }

  async toggleTerminalPin(id: string, isPinned: boolean): Promise<void> {
    const session = this.findSession(id)
    if (session) {
      session.isPinned = isPinned
      this.webContents?.send('agent:session-created', this.withControlState(session))
    }
    terminalSessionDB.updateSessionPinned(id, isPinned)
  }

  async updateHostMetadata(
    hostId: string,
    updates: Partial<Pick<import('../../shared/types').Host, 'alias' | 'tags'>>
  ): Promise<void> {
    hostDB.updateHost(hostId, updates)
    this.webContents?.send('host:updated', { hostId, ...updates })
  }

  async searchTopics(query: string): Promise<unknown[]> {
    return topicDB.searchTopics(query)
  }

  async searchMemories(query: string, hostId?: string, topicId?: string): Promise<unknown[]> {
    return memoryDB.searchMemories(query, { hostId, topicId })
  }

  async getSessions(topicId: string): Promise<AgentSession[]> {
    const hostMap = this.topicSessions.get(topicId)
    if (!hostMap) return []
    const allSessions: AgentSession[] = []
    for (const sessions of hostMap.values()) {
      allSessions.push(...sessions.map((session) => this.withControlState(session)))
    }
    return allSessions
  }

  async registerSession(session: AgentSession, options: { emit?: boolean } = {}): Promise<void> {
    let hostMap = this.topicSessions.get(session.topicId)
    if (!hostMap) {
      hostMap = new Map()
      this.topicSessions.set(session.topicId, hostMap)
    }

    let sessions = hostMap.get(session.hostId)
    if (!sessions) {
      sessions = []
      hostMap.set(session.hostId, sessions)
    }

    const existingIndex = sessions.findIndex((s) => s.id === session.id)
    let registeredSession = session
    if (existingIndex === -1) {
      sessions.push(session)
    } else {
      registeredSession = {
        ...sessions[existingIndex],
        ...session,
        visible: session.visible ?? sessions[existingIndex].visible,
        paused: session.paused ?? sessions[existingIndex].paused,
        takeoverMode: session.takeoverMode ?? sessions[existingIndex].takeoverMode ?? null
      }
      sessions[existingIndex] = registeredSession
    }

    if (registeredSession.visible !== undefined) {
      terminalSessionDB.updateSessionVisibility(registeredSession.id, registeredSession.visible)
    }
    if (registeredSession.name !== undefined) {
      terminalSessionDB.updateSessionName(registeredSession.id, registeredSession.name)
    }
    if (registeredSession.isPinned !== undefined) {
      terminalSessionDB.updateSessionPinned(registeredSession.id, registeredSession.isPinned)
    }

    if (options.emit ?? true) {
      this.webContents?.send('agent:session-created', this.withControlState(registeredSession))
    }
  }

  async ensureSession(
    topicId: string,
    hostId: string,
    hostAlias: string,
    name?: string,
    showInUI = false,
    options: { role?: TerminalSessionRole } = {}
  ): Promise<AgentSession> {
    const sessions = this.topicSessions.get(topicId)?.get(hostId)
    const role = options.role ?? 'agent_command'

    const reusableSession = this.findReusableSession(sessions, name, role)
    if (reusableSession) {
      if (showInUI) {
        reusableSession.visible = true
        terminalSessionDB.updateSessionVisibility(reusableSession.id, true)
        this.webContents?.send('agent:session-created', this.withControlState(reusableSession))
      }
      return reusableSession
    }

    return this.createNewSession(topicId, hostId, hostAlias, name, showInUI, role)
  }

  async setPaused(id: string, paused: boolean): Promise<void> {
    const session = this.findSession(id)
    if (!session) return
    commandExecutor.setSessionPaused(id, paused)
    const updated = this.withControlState(session)
    session.paused = updated.paused
    session.isLocked = updated.isLocked
    session.lockedBy = updated.lockedBy
    session.takeoverMode = updated.takeoverMode
  }

  async isPaused(id: string): Promise<boolean> {
    const session = this.findSession(id)
    if (!session) return false
    return this.withControlState(session).paused ?? false
  }

  private async createNewSession(
    topicId: string,
    hostId: string,
    hostAlias: string,
    name?: string,
    showInUI = false,
    role: TerminalSessionRole = 'agent_command'
  ): Promise<AgentSession> {
    if (!this.webContents) throw new Error('WebContents not initialized')

    let session: AgentSession
    const existingCount = this.topicSessions.get(topicId)?.get(hostId)?.length || 0

    if (hostId === 'local') {
      const localSession = await createLocalSession(
        uuidv4(),
        topicId,
        this.webContents,
        role !== 'user',
        role
      )
      session = {
        ...localSession,
        role,
        paused: false,
        takeoverMode: null,
        name: name || this.defaultSessionName(hostAlias, existingCount, role, true),
        visible: showInUI
      } as AgentSession
    } else {
      if (!this.createAgentSessionRef) throw new Error('SSH service not initialized')
      const sessionId = await this.createAgentSessionRef(hostId, this.webContents, topicId, role)
      session = {
        id: sessionId,
        topicId,
        hostId,
        hostAlias,
        role,
        status: 'active',
        shellType: 'bash',
        shellIntegrationReady: false,
        createdAt: Date.now(),
        paused: false,
        takeoverMode: null,
        name: name || this.defaultSessionName(hostAlias, existingCount, role, false),
        visible: showInUI
      }
    }

    if (session.name) {
      terminalSessionDB.updateSessionName(session.id, session.name)
    }

    await this.registerSession(session, { emit: showInUI })
    return session
  }

  private findReusableSession(
    sessions: AgentSession[] | undefined,
    preferredName?: string,
    role: TerminalSessionRole = 'agent_command'
  ): AgentSession | undefined {
    if (!sessions || sessions.length === 0) return undefined

    const isReusable = (session: AgentSession): boolean => {
      const current = this.withControlState(session)
      if ((current.role ?? 'agent_command') !== role) return false
      if (current.status !== 'active' || current.paused) return false
      if (current.lockedBy === 'user') return false
      if (role === 'agent_command') return commandExecutor.canAcceptAgentCommand(session.id).ok
      const lock = commandExecutor.isSessionLocked(session.id)
      return !lock.locked || lock.lockedBy !== 'user'
    }

    if (preferredName) {
      const namedSession = sessions.find(
        (session) => session.name === preferredName && isReusable(session)
      )
      if (namedSession) return namedSession
    }

    return sessions.find(isReusable)
  }

  private defaultSessionName(
    hostAlias: string,
    existingCount: number,
    role: TerminalSessionRole,
    local: boolean
  ): string {
    if (role === 'agent_command') {
      return existingCount > 0
        ? `Agent 执行-${hostAlias}-${existingCount + 1}`
        : `Agent 执行-${hostAlias}`
    }
    if (role === 'interactive') return `交互终端-${existingCount + 1}`
    return local ? `本地终端-${existingCount + 1}` : `终端-${existingCount + 1}`
  }

  private findSession(id: string): AgentSession | undefined {
    for (const hostMap of this.topicSessions.values()) {
      for (const sessions of hostMap.values()) {
        const session = sessions.find((s) => s.id === id)
        if (session) return session
      }
    }
    return undefined
  }

  private removeSession(id: string): void {
    for (const hostMap of this.topicSessions.values()) {
      for (const [hostId, sessions] of hostMap.entries()) {
        const index = sessions.findIndex((s) => s.id === id)
        if (index === -1) continue
        sessions.splice(index, 1)
        if (sessions.length === 0) hostMap.delete(hostId)
        return
      }
    }
  }

  private withControlState(session: AgentSession): AgentSession {
    const controlState = commandExecutor.getSessionControlState(session.id)
    if (!controlState) return session
    return {
      ...session,
      paused: controlState.paused,
      isLocked: controlState.isLocked,
      lockedBy: controlState.lockedBy,
      takeoverMode: controlState.takeoverMode
    }
  }
}
