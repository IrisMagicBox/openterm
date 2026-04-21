import { WebContents, ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { topicDB, messageDB, hostDB, taskDB, memoryDB, agentRunDB } from './db'
import { getErrorMessage } from '../shared/errors'
import { Message, TerminalSession, Task } from '../shared/types'
import { AgentRunner, AgentContext, AuthResponse } from './AgentRunner'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { createLocalSession } from './local-terminal'
import { agentRunStore } from './agent/agent-run-store'

type CreateAgentSessionFn = (
  hostId: string,
  webContents: import('electron').WebContents,
  topicId?: string
) => Promise<string>

let createAgentSessionRef: CreateAgentSessionFn | null = null

export function setCreateAgentSession(fn: CreateAgentSessionFn | null) {
  createAgentSessionRef = fn
}

export interface AgentSession extends TerminalSession {
  paused: boolean
}

export class AgentService {
  private webContents?: WebContents
  private topicSessions: Map<string, Map<string, AgentSession[]>> = new Map()
  private pendingRequests: Map<string, (response: AuthResponse) => void> = new Map()
  private activeRunControllers: Map<string, AbortController> = new Map()

  setWebContents(webContents: WebContents) {
    this.webContents = webContents
  }

  async getTopicHosts(topicId: string) {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return []
    return Promise.all(topic.hostIds.map((id) => hostDB.getHostById(id)))
  }

  async addHostToTopic(topicId: string, hostId: string) {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return
    if (!topic.hostIds.includes(hostId)) {
      const newHostIds = [...topic.hostIds, hostId]
      topicDB.updateTopicHosts(topicId, newHostIds)
    }
  }

  async removeHostFromTopic(topicId: string, hostId: string) {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) return
    const newHostIds = topic.hostIds.filter((id) => id !== hostId)
    topicDB.updateTopicHosts(topicId, newHostIds)

    const hostMap = this.topicSessions.get(topicId)
    if (hostMap) {
      const sessions = hostMap.get(hostId)
      if (sessions) {
        for (const session of sessions) {
          commandExecutor.closeSession(session.id)
        }
        hostMap.delete(hostId)
      }
    }
  }

  async createTerminal(topicId: string, hostId: string, name?: string) {
    const host = hostDB.getHostById(hostId)
    if (!host) throw new Error('Host not found')

    // Explicitly create a NEW session instead of ensuring one (which might reuse)
    const session = await this.createNewSession(topicId, hostId, host.alias, name, true)
    return session
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

    if (hostId === 'local') {
      // Create local terminal session
      const localSession = await createLocalSession(uuidv4(), topicId, this.webContents, true)
      session = {
        ...localSession,
        paused: false,
        name: name || `本地终端-${(this.topicSessions.get(topicId)?.get(hostId)?.length || 0) + 1}`,
        visible: showInUI
      } as AgentSession
    } else {
      // Create SSH session
      if (!createAgentSessionRef) throw new Error('SSH service not initialized')
      const sessionId = await createAgentSessionRef(hostId, this.webContents, topicId)
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
        name: name || `终端-${(this.topicSessions.get(topicId)?.get(hostId)?.length || 0) + 1}`,
        visible: showInUI
      }
    }

    this.registerSession(session)
    return session
  }

  async closeTerminal(id: string) {
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

  async renameTerminal(id: string, name: string) {
    for (const hostMap of this.topicSessions.values()) {
      for (const sessions of hostMap.values()) {
        const session = sessions.find((s) => s.id === id)
        if (session) {
          session.name = name
          return
        }
      }
    }
  }

  async toggleTerminalPin(id: string, isPinned: boolean) {
    for (const hostMap of this.topicSessions.values()) {
      for (const sessions of hostMap.values()) {
        const session = sessions.find((s) => s.id === id)
        if (session) {
          session.isPinned = isPinned
          return
        }
      }
    }
  }

  async updateHostMetadata(
    hostId: string,
    updates: Partial<Pick<import('../shared/types').Host, 'alias' | 'tags'>>
  ) {
    hostDB.updateHost(hostId, updates)
    // Notify frontend if host info changed
    this.webContents?.send('host:updated', { hostId, ...updates })
  }

  async searchTopics(query: string) {
    return topicDB.searchTopics(query)
  }

  async searchMemories(query: string, hostId?: string, topicId?: string) {
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

  async registerSession(session: AgentSession) {
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

    // Always notify UI to ensure consistency between memory and view
    this.webContents?.send('agent:session-created', session)
  }

  private async ensureSession(
    topicId: string,
    hostId: string,
    hostAlias: string,
    name?: string,
    showInUI = false
  ): Promise<AgentSession> {
    const hostMap = this.topicSessions.get(topicId)
    const sessions = hostMap?.get(hostId)

    // 1. If name is provided, find matching session
    if (name) {
      const match = sessions?.find((s) => s.name === name)
      if (match) {
        if (showInUI && this.webContents) {
          this.webContents.send('agent:session-created', match)
        }
        return match
      }
    } else if (sessions && sessions.length > 0) {
      // 2. Default to first session if no name provided
      const session = sessions[0]
      if (showInUI && this.webContents) {
        this.webContents.send('agent:session-created', session)
      }
      return session
    }

    // 2. Create a new real session if none exists
    if (!this.webContents) throw new Error('WebContents not initialized')

    let session: AgentSession

    if (hostId === 'local') {
      // Create local terminal session
      const localSession = await createLocalSession(uuidv4(), topicId, this.webContents, true)
      session = {
        ...localSession,
        paused: false
      }
    } else {
      // Create SSH session
      if (!createAgentSessionRef) throw new Error('SSH service not initialized')
      const sessionId = await createAgentSessionRef(hostId, this.webContents, topicId)
      session = {
        id: sessionId,
        topicId,
        hostId,
        hostAlias,
        name: name || `${hostAlias} Terminal ${(sessions?.length || 0) + 1}`,
        status: 'active',
        shellIntegrationReady: false,
        isPinned: false,
        visible: true,
        paused: false,
        createdAt: Date.now()
      }
    }

    await this.registerSession(session)

    if (showInUI && this.webContents) {
      this.webContents.send('agent:session-created', session)
    }

    return session
  }

  async handleMessage(topicId: string, content: string) {
    return this.processMessage(topicId, content)
  }

  private async processMessage(topicId: string, content: string) {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) throw new Error('Topic not found')

    // 1. Create task for tracing
    const task: Task = {
      id: uuidv4(),
      topicId,
      title: content.slice(0, 50),
      goal: content,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    taskDB.createTask(task)

    const runId = uuidv4()
    const abortController = new AbortController()
    this.activeRunControllers.set(runId, abortController)

    // 2. Create user message
    const userMsg: Message = {
      id: uuidv4(),
      topicId,
      runId,
      role: 'user',
      content,
      timestamp: Date.now()
    }
    messageDB.createMessage(userMsg)

    // Update topic title if it looks like a default one
    if (topic && (topic.title.startsWith('Session ') || topic.title === '新建话题')) {
      const newTitle = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      topicDB.updateTopicTitle(topicId, newTitle)
      this.webContents?.send('topic:updated', { topicId, title: newTitle })
    }

    if (this.webContents) {
      this.webContents.send('agent:thinking', { topicId, thinking: true })
    }

    try {
      if (!this.webContents) throw new Error('WebContents not initialized')

      const context: AgentContext = {
        topicId,
        taskId: task.id,
        webContents: this.webContents,
        agentService: this,
        ensureSession: async (hostId, hostAlias, name) => {
          // Change showInUI to true to ensure all agent-created terminals appear in the sidebar
          const session = await this.ensureSession(topicId, hostId, hostAlias, name, true)
          return session.id
        },
        requestAuthorization: async (command, riskLevel, reason) => {
          const requestId = uuidv4()
          this.webContents?.send('agent:auth-request', { requestId, command, riskLevel, reason })
          return new Promise((resolve) => {
            this.pendingRequests.set(requestId, resolve)
          })
        },
        notifyStep: (msg) => {
          if (this.webContents) {
            this.webContents.send('agent:step', msg)
          }
        },
        metadata: (_input) => {},
        runId,
        abort: abortController.signal
      }

      const runner = new AgentRunner(context, 'build', { runId, goal: content })
      const messages = await messageDB.getMessages(topicId)
      const result = await runner.run(messages)

      this.webContents?.send('agent:thinking', { topicId, thinking: false })
      return result
    } catch (error: unknown) {
      this.webContents?.send('agent:thinking', { topicId, thinking: false })
      logger.error('Agent', `Error processing message: ${getErrorMessage(error)}`)
      const errorMsg: Message = {
        id: uuidv4(),
        topicId,
        role: 'assistant',
        content: `抱歉，处理您的请求时出现错误: ${getErrorMessage(error)}`,
        timestamp: Date.now()
      }
      messageDB.createMessage(errorMsg)
      if (this.webContents) {
        this.webContents.send('agent:message', errorMsg)
      }
      return errorMsg
    } finally {
      this.activeRunControllers.delete(runId)
      if (this.webContents) {
        this.webContents.send('agent:thinking', { topicId, thinking: false })
      }
    }
  }

  async cancelRun(runId: string) {
    const controller = this.activeRunControllers.get(runId)
    controller?.abort()
    agentRunStore.cancelRunTree(runId, 'User cancelled run')
    return agentRunDB.getRun(runId)
  }

  async resumeRun(runId: string) {
    const run = agentRunDB.getRun(runId)
    if (!run) throw new Error('Agent run not found')
    if (!this.webContents) throw new Error('WebContents not initialized')

    const abortController = new AbortController()
    this.activeRunControllers.set(runId, abortController)
    agentRunStore.updateRun(runId, { status: 'running', error: undefined, completedAt: undefined })

    try {
      const context: AgentContext = {
        topicId: run.topicId,
        taskId: run.taskId,
        runId,
        parentRunId: run.parentRunId,
        parentPartId: run.parentPartId,
        webContents: this.webContents,
        agentService: this,
        ensureSession: async (hostId, hostAlias, name) => {
          const session = await this.ensureSession(run.topicId, hostId, hostAlias, name, true)
          return session.id
        },
        requestAuthorization: async (command, riskLevel, reason) => {
          const requestId = uuidv4()
          this.webContents?.send('agent:auth-request', { requestId, command, riskLevel, reason })
          return new Promise((resolve) => {
            this.pendingRequests.set(requestId, resolve)
          })
        },
        notifyStep: (msg) => {
          this.webContents?.send('agent:step', msg)
        },
        metadata: (_input) => {},
        abort: abortController.signal
      }

      const runner = new AgentRunner(context, run.agentName, {
        runId,
        parentRunId: run.parentRunId,
        parentPartId: run.parentPartId,
        persistFinalMessage: !run.parentRunId,
        updateTaskStatus: !run.parentRunId,
        goal: run.goal
      })
      const messages = await messageDB.getMessages(run.topicId)
      return await runner.run(messages)
    } finally {
      this.activeRunControllers.delete(runId)
    }
  }

  async handleAuthResponse(requestId: string, approved: boolean, alwaysAllow = false) {
    const resolve = this.pendingRequests.get(requestId)
    if (resolve) {
      resolve({ approved, alwaysAllow })
      this.pendingRequests.delete(requestId)
    }
  }

  async setPaused(id: string, paused: boolean) {
    for (const hostMap of this.topicSessions.values()) {
      for (const sessions of hostMap.values()) {
        const session = sessions.find((s) => s.id === id)
        if (session) {
          session.paused = paused
          return
        }
      }
    }
  }

  async isPaused(id: string): Promise<boolean> {
    for (const hostMap of this.topicSessions.values()) {
      for (const sessions of hostMap.values()) {
        const session = sessions.find((s) => s.id === id)
        if (session) return session.paused
      }
    }
    return false
  }
}

export const agentService = new AgentService()

export function setupAgentHandlers() {
  ipcMain.removeHandler('agent:get-topic-hosts')
  ipcMain.handle('agent:get-topic-hosts', (_, topicId: string) =>
    agentService.getTopicHosts(topicId)
  )

  ipcMain.removeHandler('agent:add-host')
  ipcMain.handle('agent:add-host', (_, topicId: string, hostId: string) =>
    agentService.addHostToTopic(topicId, hostId)
  )

  ipcMain.removeHandler('agent:remove-host')
  ipcMain.handle('agent:remove-host', (_, topicId: string, hostId: string) =>
    agentService.removeHostFromTopic(topicId, hostId)
  )

  ipcMain.removeHandler('agent:message')
  ipcMain.handle('agent:message', (_, topicId: string, content: string) =>
    agentService.handleMessage(topicId, content)
  )

  ipcMain.removeHandler('agent:auth-response')
  ipcMain.handle(
    'agent:auth-response',
    (_, requestId: string, approved: boolean, alwaysAllow?: boolean) =>
      agentService.handleAuthResponse(requestId, approved, alwaysAllow)
  )

  ipcMain.removeHandler('agent:get-sessions')
  ipcMain.handle('agent:get-sessions', (_, topicId: string) => agentService.getSessions(topicId))

  ipcMain.removeHandler('agent:create-terminal')
  ipcMain.handle('agent:create-terminal', (_, topicId: string, hostId: string, name?: string) =>
    agentService.createTerminal(topicId, hostId, name)
  )

  ipcMain.removeHandler('agent:close-terminal')
  ipcMain.handle('agent:close-terminal', (_, id: string) => agentService.closeTerminal(id))

  ipcMain.removeHandler('agent:rename-terminal')
  ipcMain.handle('agent:rename-terminal', (_, id: string, name: string) =>
    agentService.renameTerminal(id, name)
  )

  ipcMain.removeHandler('agent:toggle-terminal-pin')
  ipcMain.handle('agent:toggle-terminal-pin', (_, id: string, isPinned: boolean) =>
    agentService.toggleTerminalPin(id, isPinned)
  )
}
