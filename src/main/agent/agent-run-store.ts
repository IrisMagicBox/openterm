import { v4 as uuidv4 } from 'uuid'
import { agentPartDB, agentRunDB } from '../db'
import { eventBus } from './event-bus'
import type { AgentPart, AgentRun, AgentRunStatus, Message } from '../../shared/types'

export interface CreateRunInput {
  id?: string
  topicId: string
  taskId: string
  parentRunId?: string
  parentPartId?: string
  agentName: string
  mode: AgentRun['mode']
  status?: AgentRunStatus
  goal: string
  providerId?: string
  modelId?: string
}

export class AgentRunStore {
  createRun(input: CreateRunInput): AgentRun {
    const run = agentRunDB.createRun({
      id: input.id ?? uuidv4(),
      topicId: input.topicId,
      taskId: input.taskId,
      parentRunId: input.parentRunId,
      parentPartId: input.parentPartId,
      agentName: input.agentName,
      mode: input.mode,
      status: input.status ?? 'running',
      goal: input.goal,
      providerId: input.providerId,
      modelId: input.modelId
    })
    eventBus.publish('agent:run-created', run)
    return run
  }

  getRun(id: string): AgentRun | undefined {
    return agentRunDB.getRun(id)
  }

  getRunsByTask(taskId: string): AgentRun[] {
    return agentRunDB.getRunsByTask(taskId)
  }

  getParts(runId: string): AgentPart[] {
    return agentPartDB.getPartsByRun(runId)
  }

  getPartsByTask(taskId: string): AgentPart[] {
    return agentPartDB.getPartsByTask(taskId)
  }

  updateRun(
    id: string,
    updates: Partial<Omit<AgentRun, 'id' | 'topicId' | 'taskId' | 'createdAt'>>
  ): AgentRun | undefined {
    const run = agentRunDB.updateRun(id, updates)
    if (run) eventBus.publish('agent:run-updated', run)
    return run
  }

  completeRun(
    id: string,
    updates: Partial<Pick<AgentRun, 'usage' | 'error'>> = {}
  ): AgentRun | undefined {
    return this.updateRun(id, {
      ...updates,
      status: updates.error ? 'failed' : 'completed',
      completedAt: Date.now()
    })
  }

  cancelRunTree(id: string, reason = 'Run cancelled'): void {
    agentRunDB.cancelRunTree(id, reason)
    const run = agentRunDB.getRun(id)
    if (run) eventBus.publish('agent:run-updated', run)
    for (const part of agentPartDB.getPartsByRun(id)) {
      eventBus.publish('agent:part-updated', part)
    }
  }

  createPart(
    part: Omit<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'> &
      Partial<Pick<AgentPart, 'id' | 'createdAt' | 'updatedAt' | 'orderIndex'>>
  ): AgentPart {
    const created = agentPartDB.createPart(part)
    eventBus.publish('agent:part-created', created)
    return created
  }

  updatePart(
    id: string,
    updates: Partial<Omit<AgentPart, 'id' | 'runId' | 'createdAt'>>
  ): AgentPart | undefined {
    const updated = agentPartDB.updatePart(id, updates)
    if (updated) {
      eventBus.publish('agent:part-updated', updated)
    }
    return updated
  }

  appendMetadata(partId: string, metadata: Record<string, unknown>): AgentPart | undefined {
    return this.updatePart(partId, { metadata })
  }

  createAssistantMessagePart(run: AgentRun, message: Message): AgentPart {
    return this.createPart({
      runId: run.id,
      messageId: message.id,
      type: 'text',
      status: 'completed',
      role: 'assistant',
      output: message.content,
      metadata: { taskId: run.taskId }
    })
  }
}

export const agentRunStore = new AgentRunStore()
