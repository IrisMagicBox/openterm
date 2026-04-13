import { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall
} from 'openai/resources/chat/completions/completions'
import { messageDB, taskDB, taskStepDB } from './db'
import { getErrorMessage } from '../shared/errors'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { Message, TaskStep, ToolResult, Host } from '../shared/types'
import { AgentSession } from './agent'
import { getAIClient, getCurrentModel, SYSTEM_PROMPT } from './ai'
import { MemoryManager } from './MemoryManager'
import { MAX_AGENT_TURNS, AGENT_TEMPERATURE, TASK_SUMMARY_MAX_LENGTH } from './constants'
import { createDefaultRegistry, ToolRegistry } from './tools'

export interface AuthResponse {
  approved: boolean
  alwaysAllow: boolean
}

/** Interface for the agent service methods used by tools via AgentContext */
export interface IAgentService {
  getSessions(topicId: string): Promise<AgentSession[]>
  createTerminal(topicId: string, hostId: string, name?: string): Promise<AgentSession>
  closeTerminal(id: string): Promise<void>
  renameTerminal(id: string, name: string): Promise<void>
  updateHostMetadata(hostId: string, metadata: Record<string, unknown>): Promise<void>
  searchTopics(query: string): Promise<unknown[]>
  searchMemories(query: string, hostId?: string, topicId?: string): Promise<unknown[]>
  getTopicHosts(topicId: string): Promise<(Host | undefined)[]>
}

export interface AgentContext {
  topicId: string
  taskId: string
  webContents: WebContents
  agentService: IAgentService
  ensureSession: (hostId: string, hostAlias: string, name?: string) => Promise<string>
  requestAuthorization: (
    command: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    reason: string
  ) => Promise<AuthResponse>
  notifyStep: (message: Message) => void
  stepId?: string
}

export class AgentRunner {
  private context: AgentContext
  private toolRegistry: ToolRegistry

  constructor(context: AgentContext) {
    this.context = context
    this.toolRegistry = createDefaultRegistry()
  }

  async run(history: Message[]): Promise<Message> {
    const client = getAIClient()
    const model = getCurrentModel()
    let turnCount = 0
    const maxTurns = MAX_AGENT_TURNS

    // Recall relevant context
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()
    const extraContext = await MemoryManager.recallRelevantContext(
      this.context.topicId,
      lastUserMsg?.content || ''
    )

    const messagesHistory = history.map(
      (m): ChatCompletionMessageParam =>
        ({
          role: m.role,
          content: m.content,
          tool_calls: m.toolCalls,
          tool_call_id: m.toolCallId,
          name: m.name
        }) as ChatCompletionMessageParam
    )

    const turnMessages: ChatCompletionMessageParam[] = []

    while (turnCount < maxTurns) {
      turnCount++

      // REBUILD context in each turn to ensure state consistency
      const terminalContext = commandExecutor.buildTerminalContext(this.context.topicId)

      const currentMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT + terminalContext + extraContext },
        ...messagesHistory,
        ...turnMessages
      ]

      // Notify UI we are thinking
      this.context.notifyStep({
        id: uuidv4(),
        topicId: this.context.topicId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          taskId: this.context.taskId,
          agentStatus: turnCount === 1 ? 'thinking' : 'verifying'
        }
      })

      const response = await client.chat.completions.create({
        model,
        messages: currentMessages,
        tools: this.getTools(),
        tool_choice: turnCount === maxTurns ? 'none' : 'auto',
        temperature: AGENT_TEMPERATURE
      })

      const assistantMessage = response.choices[0].message
      turnMessages.push(assistantMessage)

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const finalContent = assistantMessage.content || ''
        const msg: Message = {
          id: uuidv4(),
          topicId: this.context.topicId,
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
          metadata: {
            taskId: this.context.taskId,
            agentStatus: 'thinking'
          }
        }

        // 1. Update task status to completed
        taskDB.updateTask(this.context.taskId, {
          status: 'completed',
          summary: finalContent.slice(0, TASK_SUMMARY_MAX_LENGTH)
        })

        // 2. Trigger asynchronous reflection
        // We don't await this to avoid blocking the user response
        MemoryManager.reflectOnTask(this.context.taskId).catch((err) => {
          logger.error('AgentRunner', 'Failed to trigger reflection:', err)
        })

        messageDB.createMessage(msg)
        this.context.notifyStep(msg)
        return msg
      }

      // Execute tools sequentially and distill observations
      for (const toolCall of assistantMessage.tool_calls || []) {
        // Notify UI we are executing
        this.context.notifyStep({
          id: uuidv4(),
          topicId: this.context.topicId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          metadata: {
            taskId: this.context.taskId,
            agentStatus: 'executing'
          }
        })

        const result = await this.executeTool(toolCall as ChatCompletionMessageFunctionToolCall)

        // After command execution, try to distill the raw output for the agent's next turn
        let observation = result.content
        const tc = toolCall as ChatCompletionMessageFunctionToolCall
        if (tc.function && tc.function.name === 'execute_command') {
          try {
            const parsed = JSON.parse(result.content)
            observation = await MemoryManager.distillObservation(
              JSON.parse(tc.function.arguments).command,
              parsed.content || '',
              parsed.exitCode
            )
          } catch (e) {
            // Fallback if parsing fails
          }
        }

        turnMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: observation
        })
      }
    }

    // Update task status to failed (max turns reached)
    taskDB.updateTask(this.context.taskId, {
      status: 'failed',
      summary: `任务达到多轮推理上限 (${MAX_AGENT_TURNS}步)，未能完全解决。`
    })

    // Fallback if max turns reached
    const timeoutMsg: Message = {
      id: uuidv4(),
      topicId: this.context.topicId,
      role: 'assistant',
      content: `对不起，我已达到多轮推理上限 (${MAX_AGENT_TURNS}步)，未能完全解决任务。请根据当前进度给出进一步指令。`,
      timestamp: Date.now(),
      metadata: {
        taskId: this.context.taskId,
        agentStatus: 'thinking'
      }
    }
    messageDB.createMessage(timeoutMsg)
    this.context.notifyStep(timeoutMsg)
    return timeoutMsg
  }

  private getTools(): ChatCompletionTool[] {
    return this.toolRegistry.getDefinitions()
  }

  private async executeTool(toolCall: ChatCompletionMessageFunctionToolCall): Promise<ToolResult> {
    const { name, arguments: argsJson } = toolCall.function
    const args = JSON.parse(argsJson)

    const step: TaskStep = {
      id: uuidv4(),
      taskId: this.context.taskId,
      type: 'command',
      status: 'running',
      title: `Calling tool ${name}`,
      content: argsJson,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    taskStepDB.createStep(step)

    try {
      this.context.stepId = step.id
      const data = await this.toolRegistry.execute(name, args, this.context)

      const resultString = `[Host: ${args.hostId}, Terminal: ${args.terminalName || 'default'}]: ${JSON.stringify(data)}`
      taskStepDB.updateStep(step.id, { status: 'completed', rawOutput: resultString })
      return { toolCallId: toolCall.id, content: resultString }
    } catch (error: unknown) {
      taskStepDB.updateStep(step.id, { status: 'failed', rawOutput: getErrorMessage(error) })
      return { toolCallId: toolCall.id, content: `Error: ${getErrorMessage(error)}` }
    }
  }
}
