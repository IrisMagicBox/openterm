import { v4 as uuidv4 } from 'uuid'
import type { AgentRun } from '../../shared/types'
import type { AgentContext } from '../AgentRunner'
import { eventBus } from './event-bus'

export type LegacyAgentStatus = 'thinking' | 'executing' | 'verifying'

export class LegacyAgentEventAdapter {
  constructor(
    private readonly run: AgentRun,
    private readonly context: AgentContext
  ) {}

  thinking(): void {
    eventBus.publish('agent:thinking', {
      topicId: this.run.topicId,
      taskId: this.run.taskId
    })
  }

  status(status: LegacyAgentStatus): void {
    this.context.notifyStep({
      id: uuidv4(),
      topicId: this.run.topicId,
      runId: this.run.id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      metadata: {
        taskId: this.run.taskId,
        agentStatus: status
      }
    })
  }

  taskComplete(status: 'completed' | 'failed', summary: string): void {
    eventBus.publish('agent:task-complete', {
      topicId: this.run.topicId,
      taskId: this.run.taskId,
      status,
      summary
    })
  }
}
