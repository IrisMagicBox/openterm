import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { hostDB, memoryDB, topicDB } from '../db'
import { commandExecutor } from '../terminal'
import { createLocalSession } from '../local-terminal'
import type { AgentSession, CreateAgentSessionFn } from './agent-service-types'

export class AgentSessionManager {
  private webContents?: WebContents
  private createAgentSessionRef: CreateAgentSessionFn | null = null
  private topicSessions: Map<string, Map<string, AgentSession[]>> = new Map()

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  setCreateAgentSession(fn: CreateAgentSessionFn | null): void {
    this.createAgentSessionRef = fn
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
    const sessions = hostMap?.get(hostId)
    if (!sessions) return
    for (const session of sessions) {
      commandExecutor.closeSession(session.id)
    }
    hostMap?.delete(hostId)
  }

  async createTerminal(topicId: string, hostId: string, name?: string): Promise<AgentSession> {
    const host = hostDB.getHostById(hostId)
    if (!host) throw new Error('Host not found')
    return this.createNewSession(topicId, hostId, host.alias, name, true)
  }

  async closeTerminal(id: string): Promise<void> {
    commandExecutor.closeSession(id)
    for (const hostMap of this.topicSessions.values()) {
      for (const [hostId, sessions] of hostMap.entries()) {
        const index = sessions.findIndex((s) => s.id === id)
        if (index !== -1) {
          sessions.splice(index, 1)
          if (sessions.length === 0) hostMap.delete(hostId)
          this.webContents?.send('agent:session-closed', { id })
          return
        }
      }
    }
  }

  async renameTerminal(id: string, name: string): Promise<void> {
    const session = this.findSession(id)
    if (session) session.name = name
  }

  async toggleTerminalPin(id: string, isPinned: boolean): Promise<void> {
    const session = this.findSession(id)
    if (session) session.isPinned = isPinned
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
      allSessions.push(...sessions)
    }
    return allSessions
  }

  async registerSession(session: AgentSession): Promise<void> {
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

    if (!sessions.find((s) => s.id === session.id)) {
      sessions.push(session)
    }

    this.webContents?.send('agent:session-created', session)
  }

  async ensureSession(
    topicId: string,
    hostId: string,
    hostAlias: string,
    name?: string,
    showInUI = false
  ): Promise<AgentSession> {
    const sessions = this.topicSessions.get(topicId)?.get(hostId)

    const reusableSession = this.findReusableSession(sessions, name)
    if (reusableSession) {
      if (showInUI) this.webContents?.send('agent:session-created', reusableSession)
      return reusableSession
    }

    const session = await this.createNewSession(topicId, hostId, hostAlias, name, true)
    if (showInUI) this.webContents?.send('agent:session-created', session)
    return session
  }

  async setPaused(id: string, paused: boolean): Promise<void> {
    const session = this.findSession(id)
    if (session) session.paused = paused
  }

  async isPaused(id: string): Promise<boolean> {
    return this.findSession(id)?.paused ?? false
  }

  private async createNewSession(
    topicId: string,
    hostId: string,
    hostAlias: string,
    name?: string,
    showInUI = false
  ): Promise<AgentSession> {
    if (!this.webContents) throw new Error('WebContents not initialized')

    let session: AgentSession
    const existingCount = this.topicSessions.get(topicId)?.get(hostId)?.length || 0

    if (hostId === 'local') {
      const localSession = await createLocalSession(uuidv4(), topicId, this.webContents, true)
      session = {
        ...localSession,
        paused: false,
        name: name || `本地终端-${existingCount + 1}`,
        visible: showInUI
      } as AgentSession
    } else {
      if (!this.createAgentSessionRef) throw new Error('SSH service not initialized')
      const sessionId = await this.createAgentSessionRef(hostId, this.webContents, topicId)
      session = {
        id: sessionId,
        topicId,
        hostId,
        hostAlias,
        status: 'active',
        shellType: 'bash',
        shellIntegrationReady: false,
        createdAt: Date.now(),
        paused: false,
        name: name || `终端-${existingCount + 1}`,
        visible: showInUI
      }
    }

    await this.registerSession(session)
    return session
  }

  private findReusableSession(
    sessions: AgentSession[] | undefined,
    preferredName?: string
  ): AgentSession | undefined {
    if (!sessions || sessions.length === 0) return undefined

    const isReusable = (session: AgentSession): boolean =>
      session.status === 'active' && !session.paused && commandExecutor.isSessionIdle(session.id)

    if (preferredName) {
      const namedSession = sessions.find(
        (session) => session.name === preferredName && isReusable(session)
      )
      if (namedSession) return namedSession
    }

    return sessions.find(isReusable)
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
}
