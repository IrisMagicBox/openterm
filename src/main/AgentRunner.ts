import { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  hostDB,
  messageDB,
  taskStepDB,
  approvalDB,
  permissionDB
} from './db'
import { commandExecutor } from './terminal'
import { Message, TaskStep, ToolResult } from '../shared/types'
import { getAIClient, getCurrentModel, SYSTEM_PROMPT } from './ai'
import { MemoryManager } from './MemoryManager'
import { PolicyEngine } from './PolicyEngine'

export interface AgentContext {
  topicId: string
  taskId: string
  webContents: WebContents
  agentService: any
  ensureSession: (hostId: string, hostAlias: string, name?: string) => Promise<string>
  requestAuthorization: (command: string, riskLevel: 'low' | 'medium' | 'high' | 'critical', reason: string) => Promise<boolean>
  notifyStep: (message: Message) => void
}

export class AgentRunner {
  private context: AgentContext

  constructor(context: AgentContext) {
    this.context = context
  }

  async run(history: Message[]): Promise<Message> {
    const client = getAIClient()
    const model = getCurrentModel()
    let turnCount = 0
    const maxTurns = 10

    // Recall relevant context
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()
    const extraContext = await MemoryManager.recallRelevantContext(
      this.context.topicId,
      lastUserMsg?.content || ''
    )

    // Build terminal state context
    const terminalContext = commandExecutor.buildTerminalContext(this.context.topicId)

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + terminalContext + extraContext },
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: (m as any).toolCalls,
        tool_call_id: m.toolCallId,
        name: m.name
      }))
    ]

    while (turnCount < maxTurns) {
      turnCount++
      
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
        messages,
        tools: this.getTools()
      })

      const assistantMessage = response.choices[0].message
      messages.push(assistantMessage)

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
            agentStatus: 'thinking' // Final response returns to thinking/idle state visually
          }
        }
        messageDB.createMessage(msg)
        this.context.notifyStep(msg)
        return msg
      }

      // Execute tools sequentially and distill observations
      for (const toolCall of (assistantMessage.tool_calls || [])) {
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

        const result = await this.executeTool(toolCall)
        
        // After command execution, try to distill the raw output for the agent's next turn
        let observation = result.content
        const tc = toolCall as any // Narrowing for simplified access
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

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: observation
        })
      }
    }

    // Fallback if max turns reached
    const timeoutMsg: Message = {
      id: uuidv4(),
      topicId: this.context.topicId,
      role: 'assistant',
      content: '对不起，我已达到多轮推理上限 (10步)，未能完全解决任务。请根据当前进度给出进一步指令。',
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

  private getTools(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: '在指定主机上执行终端命令',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: '主机ID' },
              terminalName: { type: 'string', description: '终端名称（可选，默认为 default。指定新名称可开启并锁定新终端窗口实现并发）' },
              command: { type: 'string', description: '要执行的命令' },
              reason: { type: 'string', description: '执行该命令的原因' }
            },
            required: ['hostId', 'command', 'reason']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '从指定主机读取文件内容',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: '主机ID' },
              path: { type: 'string', description: '文件路径' }
            },
            required: ['hostId', 'path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_hosts',
          description: '列出当前 Topic 下的所有可用主机',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'manage_terminal',
          description: '显式管理终端窗口（开启、关闭、重命名）',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: '主机ID' },
              action: { type: 'string', enum: ['open', 'close', 'rename'], description: '操作类型' },
              terminalName: { type: 'string', description: '终端名称。对于 open/rename 必须提供' },
              sessionId: { type: 'string', description: '操作 close/rename 时指定的会话ID（可选，若不提供则根据 terminalName 查找）' }
            },
            required: ['hostId', 'action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'manage_host',
          description: '管理主机元数据（更新别名、标签）',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: '主机ID' },
              alias: { type: 'string', description: '新别名' },
              tags: { type: 'array', items: { type: 'string' }, description: '新标签列表' }
            },
            required: ['hostId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_memory',
          description: '在全局经验库或当前主机/话题中搜索关联记忆',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              hostId: { type: 'string', description: '限定主机ID（可选）' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_topics',
          description: '搜索历史话题（对话），寻找处理类似问题的历史记录',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: '向指定主机写入或覆盖文件内容',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: '主机ID' },
              path: { type: 'string', description: '文件路径' },
              content: { type: 'string', description: '文件内容' }
            },
            required: ['hostId', 'path', 'content']
          }
        }
      }
    ]
  }

  private async executeTool(toolCall: any): Promise<ToolResult> {
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
      let data: any
      switch (name) {
        case 'execute_command':
          data = await this.handleExecuteCommand(args, step)
          break
        case 'read_file':
          data = await this.handleReadFile(args)
          break
        case 'list_hosts':
          data = await this.handleListHosts()
          break
        case 'manage_terminal':
          data = await this.handleManageTerminal(args)
          break
        case 'manage_host':
          data = await this.handleManageHost(args)
          break
        case 'search_memory':
          data = await this.handleSearchMemory(args)
          break
        case 'search_topics':
          data = await this.handleSearchTopics(args)
          break
        case 'write_file':
          data = await this.handleWriteFile(args)
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      const resultString = `[Host: ${args.hostId}, Terminal: ${args.terminalName || 'default'}]: ${JSON.stringify(data)}`
      taskStepDB.updateStep(step.id, { status: 'completed', rawOutput: resultString })
      return { toolCallId: toolCall.id, content: resultString }
    } catch (error: any) {
      taskStepDB.updateStep(step.id, { status: 'failed', rawOutput: error.message })
      return { toolCallId: toolCall.id, content: `Error: ${error.message}` }
    }
  }

  private async handleExecuteCommand(args: any, step: TaskStep) {
    const { hostId, command, reason, terminalName } = args
    const normalizedHostId = hostId.startsWith('@') ? hostId.slice(1) : hostId
    const hosts = hostDB.getHosts()
    const host = hosts.find(h => h.id === normalizedHostId || h.alias === normalizedHostId)
    if (!host) throw new Error(`Host ${hostId} not found. Please list_hosts to see available hosts in this topic.`)

    // Check policy
    const policyResult = PolicyEngine.evaluate(command)
    if (policyResult.action === 'deny') {
      throw new Error(`Command blocked by policy: ${policyResult.reason}`)
    }

    const permissions = permissionDB.getPermissions()

    if (policyResult.action === 'confirm' && permissions.requireConfirmation) {
      const approved = await this.context.requestAuthorization(command, policyResult.riskLevel, reason)
      if (!approved) {
        approvalDB.createApproval({
          id: uuidv4(),
          taskId: this.context.taskId,
          stepId: step.id,
          command,
          riskLevel: policyResult.riskLevel,
          reason,
          status: 'rejected',
          createdAt: Date.now()
        })
        throw new Error('User rejected command authorization')
      }
      approvalDB.createApproval({
        id: uuidv4(),
        taskId: this.context.taskId,
        stepId: step.id,
        command,
        riskLevel: policyResult.riskLevel,
        reason,
        status: 'approved',
        createdAt: Date.now()
      })
    }

    // Ensure session
    const sessionId = await this.context.ensureSession(host.id, host.alias, terminalName)
    
    // Execute via commandExecutor
    const result = await commandExecutor.execute(sessionId, command, this.context.topicId, this.context.taskId, step.id)
    
    return result
  }

  private async handleReadFile(args: any) {
    const { hostId, path, terminalName } = args
    const normalizedHostId = hostId.startsWith('@') ? hostId.slice(1) : hostId
    const hosts = hostDB.getHosts()
    const host = hosts.find(h => h.id === normalizedHostId || h.alias === normalizedHostId)
    if (!host) throw new Error(`Host ${hostId} not found`)

    const sessionId = await this.context.ensureSession(host.id, host.alias, terminalName)
    const result = await commandExecutor.execute(sessionId, `cat "${path}"`, this.context.topicId, this.context.taskId)
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.content}`)
    }
    
    return result.content
  }

  private async handleWriteFile(args: any) {
    const { hostId, path, content } = args
    const normalizedHostId = hostId.startsWith('@') ? hostId.slice(1) : hostId
    
    // Ensure we have a session
    const sessionId = await this.context.ensureSession(normalizedHostId, normalizedHostId)
    
    // Use base64 to avoid shell escaping issues with complex characters
    const b64 = Buffer.from(content).toString('base64')
    // We try to use 'base64 -d' (common on Linux) or 'openssl base64 -d'
    const commandRegex = `printf "%s" '${b64}' | base64 -d > "${path}"`
    
    const result = await commandExecutor.execute(sessionId, commandRegex, this.context.topicId, this.context.taskId)
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.content}`)
    }
    
    return { message: 'File written successfully', path }
  }

  private async handleListHosts() {
    return this.context.agentService.getTopicHosts(this.context.topicId)
  }

  private async handleManageTerminal(args: any) {
    const { action, hostId, terminalName, sessionId } = args
    const normalizedHostId = hostId.startsWith('@') ? hostId.slice(1) : hostId
    
    switch (action) {
      case 'open':
        const session = await this.context.agentService.createTerminal(this.context.topicId, normalizedHostId, terminalName)
        return { message: 'Terminal opened', sessionId: session.id, name: session.name }
      case 'close':
        await this.context.agentService.closeTerminal(sessionId)
        return { message: 'Terminal closed', sessionId }
      case 'rename':
        await this.context.agentService.renameTerminal(sessionId, terminalName)
        return { message: 'Terminal renamed', sessionId, newName: terminalName }
      default:
        throw new Error('Invalid action for manage_terminal')
    }
  }

  private async handleManageHost(args: any) {
    const { hostId, alias, tags } = args
    const normalizedHostId = hostId.startsWith('@') ? hostId.slice(1) : hostId
    await this.context.agentService.updateHostMetadata(normalizedHostId, { alias, tags })
    return { message: 'Host metadata updated', hostId: normalizedHostId }
  }

  private async handleSearchMemory(args: any) {
    const { query, hostId } = args
    const normalizedHostId = hostId?.startsWith('@') ? hostId.slice(1) : hostId
    const memories = await this.context.agentService.searchMemories(query, normalizedHostId, this.context.topicId)
    return memories.map((m: any) => ({
      type: m.type,
      content: m.content,
      importance: m.importance,
      timestamp: new Date(m.timestamp).toISOString()
    }))
  }

  private async handleSearchTopics(args: any) {
    const { query } = args
    const topics = await this.context.agentService.searchTopics(query)
    return topics.map((t: any) => ({
      id: t.id,
      title: t.title,
      lastAt: new Date(t.lastMessageAt).toISOString()
    }))
  }
}
