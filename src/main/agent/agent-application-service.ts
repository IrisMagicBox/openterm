import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getErrorMessage } from '../../shared/errors'
import type { AgentRun, Message, Task } from '../../shared/types'
import { agentRunDB, messageDB, taskDB, topicDB } from '../db'
import { AgentRunner, type AgentContext, type IAgentService } from '../AgentRunner'
import { resolveProviderSelection } from '../ai'
import { logger } from '../logger'
import { agentRunStore } from './agent-run-store'
import type { AgentSessionManager } from './agent-session-manager'
import type { ApprovalBroker } from './approval-broker'

export class AgentApplicationService {
  private webContents?: WebContents
  private activeRunControllers: Map<string, AbortController> = new Map()

  constructor(
    private readonly sessions: AgentSessionManager,
    private readonly approvals: ApprovalBroker,
    private readonly getAgentService: () => IAgentService
  ) {}

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  async handleMessage(topicId: string, content: string): Promise<Message> {
    const topic = topicDB.getTopicById(topicId)
    if (!topic) throw new Error('Topic not found')
    const selection = (() => {
      try {
        return resolveProviderSelection({ topicId })
      } catch {
        return undefined
      }
    })()

    const task: Task = {
      id: uuidv4(),
      topicId,
      title: content.slice(0, 50),
      goal: content,
      status: 'running',
      selectedProviderId: selection?.provider.id ?? topic.selectedProviderId,
      selectedModelId: selection?.modelRecordId ?? topic.selectedModelId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    taskDB.createTask(task)

    const runId = uuidv4()
    const abortController = new AbortController()
    this.activeRunControllers.set(runId, abortController)

    const userMsg: Message = {
      id: uuidv4(),
      topicId,
      runId,
      role: 'user',
      content,
      timestamp: Date.now()
    }
    messageDB.createMessage(userMsg)

    if (topic.title.startsWith('Session ') || topic.title === '新建话题') {
      const title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      topicDB.updateTopicTitle(topicId, title)
      this.webContents?.send('topic:updated', { topicId, title })
    }

    this.webContents?.send('agent:thinking', { topicId, thinking: true })

    try {
      if (!this.webContents) throw new Error('WebContents not initialized')
      const context = this.createContext(topicId, task.id, runId, abortController.signal)
      const runner = new AgentRunner(context, 'build', { runId, goal: content })
      const messages = await messageDB.getMessages(topicId)
      return await runner.run(messages)
    } catch (error: unknown) {
      logger.error('AgentApplicationService', `Error processing message: ${getErrorMessage(error)}`)
      const errorMsg: Message = {
        id: uuidv4(),
        topicId,
        role: 'assistant',
        content: `抱歉，处理您的请求时出现错误: ${getErrorMessage(error)}`,
        timestamp: Date.now()
      }
      messageDB.createMessage(errorMsg)
      this.webContents?.send('agent:message', errorMsg)
      return errorMsg
    } finally {
      this.activeRunControllers.delete(runId)
      this.webContents?.send('agent:thinking', { topicId, thinking: false })
    }
  }

  async cancelRun(runId: string): Promise<AgentRun | undefined> {
    const controller = this.activeRunControllers.get(runId)
    controller?.abort()
    agentRunStore.cancelRunTree(runId, 'User cancelled run')
    return agentRunDB.getRun(runId)
  }

  async resumeRun(runId: string): Promise<Message> {
    const run = agentRunDB.getRun(runId)
    if (!run) throw new Error('Agent run not found')
    if (!this.webContents) throw new Error('WebContents not initialized')

    const abortController = new AbortController()
    this.activeRunControllers.set(runId, abortController)
    agentRunStore.updateRun(runId, { status: 'running', error: undefined, completedAt: undefined })

    try {
      const context = this.createContext(run.topicId, run.taskId, runId, abortController.signal, {
        parentRunId: run.parentRunId,
        parentPartId: run.parentPartId
      })
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

  private createContext(
    topicId: string,
    taskId: string,
    runId: string,
    abort: AbortSignal,
    parents: { parentRunId?: string; parentPartId?: string } = {}
  ): AgentContext {
    if (!this.webContents) throw new Error('WebContents not initialized')
    return {
      topicId,
      taskId,
      runId,
      parentRunId: parents.parentRunId,
      parentPartId: parents.parentPartId,
      webContents: this.webContents,
      agentService: this.getAgentService(),
      ensureSession: async (hostId, hostAlias, name, options) => {
        const session = await this.sessions.ensureSession(
          topicId,
          hostId,
          hostAlias,
          name,
          true,
          options
        )
        return session.id
      },
      requestAuthorization: (command, riskLevel, reason, metadata) =>
        this.approvals.requestAuthorization(command, riskLevel, reason, metadata),
      notifyStep: (msg) => {
        this.webContents?.send('agent:step', msg)
      },
      metadata: () => {},
      abort
    }
  }
}
