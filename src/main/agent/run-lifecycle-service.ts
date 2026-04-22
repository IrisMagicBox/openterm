import { v4 as uuidv4 } from 'uuid'
import type { AgentRun, Message } from '../../shared/types'
import { messageDB, taskDB } from '../db'
import { logger } from '../logger'
import { MemoryManager } from '../MemoryManager'
import { TASK_SUMMARY_MAX_LENGTH } from '../constants'
import type { AgentProcessorOptions } from './agent-processor-types'
import { agentRunStore } from './agent-run-store'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'

function extractProviderErrorContent(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (
      typeof parsed.status !== 'number' ||
      parsed.status < 400 ||
      typeof parsed.message !== 'string' ||
      !('result' in parsed)
    ) {
      return undefined
    }

    try {
      const nested = JSON.parse(parsed.message) as Record<string, unknown>
      const nestedError = nested.error as Record<string, unknown> | undefined
      if (typeof nestedError?.message === 'string') return nestedError.message
    } catch {
      // Fall through to the top-level provider message.
    }

    return parsed.message
  } catch {
    return undefined
  }
}

export class RunLifecycleService {
  private readonly legacyEvents: LegacyAgentEventAdapter

  constructor(private readonly options: AgentProcessorOptions) {
    this.legacyEvents = new LegacyAgentEventAdapter(options.run, options.context)
  }

  failMaxTurns(maxTurns: number): Message {
    const { run } = this.options
    const failedSummary = `任务达到多轮推理上限 (${maxTurns}步)，未能完全解决。`
    agentRunStore.completeRun(run.id, {
      error: failedSummary,
      usage: { ...this.options.provider.getSessionUsage() }
    })
    if (this.options.updateTaskStatus) {
      taskDB.updateTask(run.taskId, { status: 'failed', summary: failedSummary })
    }

    const timeoutMsg: Message = {
      id: uuidv4(),
      topicId: run.topicId,
      runId: run.id,
      role: 'assistant',
      content: `对不起，我已达到多轮推理上限 (${maxTurns}步)，未能完全解决任务。请根据当前进度给出进一步指令。`,
      timestamp: Date.now(),
      metadata: { taskId: run.taskId, agentStatus: 'thinking' }
    }
    if (this.options.persistFinalMessage) messageDB.createMessage(timeoutMsg)
    agentRunStore.createAssistantMessagePart(run, timeoutMsg)
    this.options.context.notifyStep(timeoutMsg)
    this.legacyEvents.taskComplete('failed', failedSummary)
    return timeoutMsg
  }

  finish(
    run: AgentRun,
    content: string,
    memoryRecalled: boolean,
    isVerifying: boolean,
    assistantPartId?: string
  ): Message {
    const providerError = extractProviderErrorContent(content || '')
    const finalContent = providerError ? `模型服务返回错误：${providerError}` : content || ''
    const msg: Message = {
      id: uuidv4(),
      topicId: run.topicId,
      runId: run.id,
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      metadata: {
        taskId: run.taskId,
        agentStatus: 'thinking',
        memoryRecalled,
        isVerifying
      }
    }

    if (this.options.updateTaskStatus) {
      taskDB.updateTask(run.taskId, {
        status: providerError ? 'failed' : 'completed',
        summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
      })
      if (!providerError) {
        MemoryManager.reflectOnTask(run.taskId).catch((err) => {
          logger.error('RunLifecycleService', 'Failed to trigger reflection:', err)
        })
      }
    }

    if (this.options.persistFinalMessage) messageDB.createMessage(msg)
    if (assistantPartId) {
      agentRunStore.updatePart(assistantPartId, {
        messageId: msg.id,
        status: 'completed',
        role: 'assistant',
        output: msg.content,
        metadata: { taskId: run.taskId },
        endedAt: Date.now()
      })
    } else {
      agentRunStore.createAssistantMessagePart(run, msg)
    }
    agentRunStore.completeRun(run.id, {
      usage: { ...this.options.provider.getSessionUsage() },
      error: providerError
    })
    this.options.context.notifyStep(msg)
    this.legacyEvents.taskComplete(
      providerError ? 'failed' : 'completed',
      finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
    )
    return msg
  }

  createUserPart(run: AgentRun, userMessage?: Message): void {
    if (!userMessage) return
    agentRunStore.createPart({
      runId: run.id,
      messageId: userMessage.id,
      type: 'text',
      status: 'completed',
      role: 'user',
      output: userMessage.content,
      startedAt: userMessage.timestamp,
      endedAt: userMessage.timestamp
    })
  }
}
