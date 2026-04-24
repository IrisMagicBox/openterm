import { v4 as uuidv4 } from 'uuid'
import type { AgentRun, AgentRunStopReason, Message } from '../../shared/types'
import { messageDB, taskDB } from '../db'
import { logger } from '../logger'
import { MemoryManager } from '../MemoryManager'
import { TASK_SUMMARY_MAX_LENGTH } from '../constants'
import type { AgentProcessorOptions } from './agent-processor-types'
import { agentRunStore } from './agent-run-store'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import { AgentPartWriter } from './agent-part-writer'

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
  private readonly parts = new AgentPartWriter()

  constructor(private readonly options: AgentProcessorOptions) {
    this.legacyEvents = new LegacyAgentEventAdapter(options.run, options.context)
  }

  failMaxTurns(maxTurns: number): Message {
    const { run } = this.options
    const failedSummary = `任务达到多轮推理上限 (${maxTurns}步)，未能完全解决。`
    this.parts.finishOpenParts(run.id, {
      status: 'error',
      reason: failedSummary,
      metadata: { stopReason: 'max_turns' }
    })
    agentRunStore.completeRun(run.id, {
      error: failedSummary,
      usage: this.usageWithStopReason('max_turns')
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
      metadata: { taskId: run.taskId, agentStatus: 'error' }
    }
    if (this.options.persistFinalMessage) messageDB.createMessage(timeoutMsg)
    this.parts.createTextPart({
      runId: run.id,
      messageId: timeoutMsg.id,
      role: 'assistant',
      status: 'completed',
      output: timeoutMsg.content,
      metadata: { taskId: run.taskId, stopReason: 'max_turns' },
      startedAt: timeoutMsg.timestamp,
      endedAt: timeoutMsg.timestamp
    })
    this.options.context.notifyStep(timeoutMsg)
    this.legacyEvents.taskComplete('failed', failedSummary)
    return timeoutMsg
  }

  failRuntimeBlocked(
    summary: string,
    details?: string,
    assistantPartId?: string,
    stopReason: AgentRunStopReason = 'blocked_empty_response'
  ): Message {
    const { run } = this.options
    const failedSummary = summary || 'Agent runtime 未能完成任务。'
    const finalContent = [failedSummary, details ? `\n${details}` : ''].join('').trim()

    this.parts.finishOpenParts(run.id, {
      status: 'error',
      reason: failedSummary,
      metadata: { stopReason }
    })
    agentRunStore.completeRun(run.id, {
      error: failedSummary,
      usage: this.usageWithStopReason(stopReason)
    })
    if (this.options.updateTaskStatus) {
      taskDB.updateTask(run.taskId, {
        status: 'failed',
        summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
      })
    }

    const msg: Message = {
      id: uuidv4(),
      topicId: run.topicId,
      runId: run.id,
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      metadata: { taskId: run.taskId, agentStatus: 'error' }
    }

    if (this.options.persistFinalMessage) messageDB.createMessage(msg)
    if (assistantPartId) {
      this.parts.updatePart(assistantPartId, {
        messageId: msg.id,
        status: 'error',
        role: 'assistant',
        output: msg.content,
        error: failedSummary,
        metadata: { taskId: run.taskId },
        endedAt: Date.now()
      })
    } else {
      this.parts.createErrorPart({
        runId: run.id,
        messageId: msg.id,
        role: 'assistant',
        output: msg.content,
        error: failedSummary,
        metadata: { taskId: run.taskId, stopReason },
        startedAt: msg.timestamp,
        endedAt: msg.timestamp
      })
    }
    this.options.context.notifyStep(msg)
    this.legacyEvents.taskComplete('failed', finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH))
    return msg
  }

  finish(
    run: AgentRun,
    content: string,
    memoryRecalled: boolean,
    isVerifying: boolean,
    assistantPartId?: string
  ): Message {
    const providerError = extractProviderErrorContent(content || '')
    const stopReason: AgentRunStopReason = providerError ? 'provider_error' : 'completed'
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
        agentStatus: providerError ? 'error' : 'done',
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
      this.parts.updatePart(assistantPartId, {
        messageId: msg.id,
        status: 'completed',
        role: 'assistant',
        output: msg.content,
        metadata: { taskId: run.taskId, stopReason },
        endedAt: Date.now()
      })
    } else {
      this.parts.createTextPart({
        runId: run.id,
        messageId: msg.id,
        role: 'assistant',
        status: 'completed',
        output: msg.content,
        metadata: { taskId: run.taskId, stopReason },
        startedAt: msg.timestamp,
        endedAt: msg.timestamp
      })
    }
    this.parts.finishOpenParts(run.id, {
      status: providerError ? 'error' : 'completed',
      reason: providerError ?? 'Run completed',
      metadata: { stopReason }
    })
    agentRunStore.completeRun(run.id, {
      usage: this.usageWithStopReason(stopReason),
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
    this.parts.createTextPart({
      runId: run.id,
      messageId: userMessage.id,
      status: 'completed',
      role: 'user',
      output: userMessage.content,
      startedAt: userMessage.timestamp,
      endedAt: userMessage.timestamp
    })
  }

  private usageWithStopReason(stopReason: AgentRunStopReason): Record<string, unknown> {
    return { ...this.options.provider.getSessionUsage(), stopReason }
  }
}
