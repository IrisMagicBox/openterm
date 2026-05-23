import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getErrorMessage } from '../../shared/errors'
import type { AgentRun, Message, Task } from '../../shared/types'
import { agentRunDB, messageDB, taskDB, topicDB } from '../db'
import { AgentRunner, type AgentContext, type IAgentService } from '../AgentRunner'
import { resolveProviderSelection } from '../ai'
import { logger } from '../logger'
import { agentRunStore } from './agent-run-store'
import { AgentPartProjection } from './agent-part-projection'
import type { AgentSessionManager } from './agent-session-manager'
import type { ApprovalBroker } from './approval-broker'

export class AgentApplicationService {
  private webContents?: WebContents
  private activeRunControllers: Map<string, AbortController> = new Map()
  private readonly parts = new AgentPartProjection()

  constructor(
    private readonly sessions: AgentSessionManager,
    private readonly approvals: ApprovalBroker,
    private readonly getAgentService: () => IAgentService
  ) {}

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  registerRunController(runId: string, controller: AbortController): void {
    this.activeRunControllers.set(runId, controller)
  }

  unregisterRunController(runId: string, controller?: AbortController): void {
    if (!controller || this.activeRunControllers.get(runId) === controller) {
      this.activeRunControllers.delete(runId)
    }
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
    this.registerRunController(runId, abortController)

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

    this.webContents?.send('agent:thinking', { topicId, thinking: true, taskId: task.id, runId })

    try {
      if (!this.webContents) throw new Error('WebContents not initialized')
      const context = this.createContext(topicId, task.id, runId, abortController.signal)
      const runner = new AgentRunner(context, 'build', { runId, goal: content })
      const messages = await messageDB.getMessages(topicId)
      return await runner.run(messages)
    } catch (error: unknown) {
      const message = getErrorMessage(error)
      logger.error('AgentApplicationService', `Error processing message: ${message}`)
      const failedSummary = `抱歉，处理您的请求时出现错误：${message}`
      const errorMsg: Message = {
        id: uuidv4(),
        topicId,
        runId,
        role: 'assistant',
        content: failedSummary,
        timestamp: Date.now(),
        metadata: { taskId: task.id, agentStatus: 'error' }
      }
      taskDB.updateTask(task.id, {
        status: 'failed',
        summary: errorMsg.content
      })
      this.parts.closeOpenParts(runId, {
        status: 'error',
        reason: failedSummary,
        metadata: { stopReason: 'provider_error' }
      })
      const run = agentRunStore.getRun(runId)
      if (run && !run.completedAt) {
        agentRunStore.completeRun(runId, {
          error: failedSummary,
          usage: { stopReason: 'provider_error' }
        })
      }
      messageDB.createMessage(errorMsg)
      this.parts.createAssistantTextPart({
        runId,
        messageId: errorMsg.id,
        status: 'error',
        output: errorMsg.content,
        metadata: { taskId: task.id, stopReason: 'provider_error' },
        startedAt: errorMsg.timestamp,
        endedAt: errorMsg.timestamp
      })
      this.webContents?.send('agent:message', errorMsg)
      return errorMsg
    } finally {
      this.unregisterRunController(runId, abortController)
      this.webContents?.send('agent:thinking', {
        topicId,
        thinking: false,
        taskId: task.id,
        runId
      })
    }
  }

  async cancelRun(runId: string): Promise<AgentRun | undefined> {
    const run = agentRunDB.getRun(runId)
    const controller = this.activeRunControllers.get(runId)
    controller?.abort()
    this.approvals.rejectRuns(this.collectRunTreeIds(runId), 'Run was cancelled')
    agentRunStore.cancelRunTree(runId, 'User cancelled run')
    const cancelledRun = agentRunDB.getRun(runId)
    if (cancelledRun) {
      this.webContents?.send('agent:run-updated', cancelledRun)
    }
    if (run) {
      this.webContents?.send('agent:thinking', {
        topicId: run.topicId,
        thinking: false,
        taskId: run.taskId,
        runId
      })
    }
    return cancelledRun
  }

  async resumeRun(runId: string): Promise<Message> {
    const run = agentRunDB.getRun(runId)
    if (!run) throw new Error('Agent run not found')
    if (!this.webContents) throw new Error('WebContents not initialized')

    const abortController = new AbortController()
    this.registerRunController(runId, abortController)
    agentRunStore.updateRun(runId, { status: 'running', error: undefined, completedAt: undefined })
    this.webContents?.send('agent:thinking', {
      topicId: run.topicId,
      thinking: true,
      taskId: run.taskId,
      runId
    })

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
        goal: run.goal,
        resumeFromCheckpoint: true
      })
      const messages = run.parentRunId
        ? [
            {
              id: `resume_${run.id}_${Date.now()}`,
              topicId: run.topicId,
              runId: run.id,
              role: 'user' as const,
              content: run.goal,
              timestamp: Date.now()
            }
          ]
        : await messageDB.getMessages(run.topicId)
      return await runner.run(messages)
    } finally {
      this.unregisterRunController(runId, abortController)
      this.webContents?.send('agent:thinking', {
        topicId: run.topicId,
        thinking: false,
        taskId: run.taskId,
        runId
      })
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
        const role = options?.role ?? 'agent_command'
        const session = await this.sessions.ensureSession(
          topicId,
          hostId,
          hostAlias,
          name,
          options?.visible ?? role !== 'agent_command',
          options
        )
        return session.id
      },
      requestAuthorization: (command, riskLevel, reason, metadata) =>
        this.approvals.requestAuthorization(command, riskLevel, reason, {
          ...(metadata ?? {}),
          topicId,
          runId,
          taskId
        }),
      notifyStep: (msg) => {
        this.webContents?.send('agent:step', msg)
      },
      metadata: () => {},
      abort
    }
  }

  private collectRunTreeIds(runId: string): string[] {
    const result = [runId]
    const collect = (id: string): void => {
      for (const child of agentRunDB.getChildRuns(id)) {
        result.push(child.id)
        collect(child.id)
      }
    }
    collect(runId)
    return result
  }
}
