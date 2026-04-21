import type { Message } from '../../shared/types'
import { AgentLoop } from './agent-loop'
import type { AgentProcessorOptions } from './agent-processor-types'

export class AgentProcessor {
  private readonly loop: AgentLoop

  constructor(options: AgentProcessorOptions) {
    this.loop = new AgentLoop(options)
  }

  async process(history: Message[]): Promise<Message> {
    return this.loop.process(history)
  }
}

export type { AgentProcessorOptions } from './agent-processor-types'
