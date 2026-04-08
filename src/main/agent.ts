import { ipcMain, WebContents } from 'electron'
import { hostDB, topicDB, messageDB } from './db'
import { createAgentSession, executeAgentCommand, closeSession } from './ssh'
import { Message } from '../shared/types'
import { getAIClient, getCurrentModel, SYSTEM_PROMPT } from './ai'
import { v4 as uuidv4 } from 'uuid'

interface AgentSession {
  sessionId: string
  hostId: string
  hostAlias: string
}

export class AgentService {
  private webContents?: WebContents
  private pendingRequests: Map<string, (approved: boolean) => void> = new Map()
  private topicSessions: Map<string, Map<string, AgentSession>> = new Map()

  constructor() {
    this.setupHandlers()
  }

  private setupHandlers() {
    ipcMain.removeHandler('agent:message')
    ipcMain.handle('agent:message', async (event, topicId: string, content: string) => {
      this.webContents = event.sender
      return this.processMessage(topicId, content)
    })

    ipcMain.removeHandler('agent:auth-response')
    ipcMain.handle('agent:auth-response', (_, requestId: string, approved: boolean) => {
      const resolve = this.pendingRequests.get(requestId)
      if (resolve) {
        resolve(approved)
        this.pendingRequests.delete(requestId)
      }
    })

    ipcMain.removeHandler('agent:get-sessions')
    ipcMain.handle('agent:get-sessions', (_, topicId: string) => {
      const sessions = this.topicSessions.get(topicId)
      return sessions ? Array.from(sessions.values()) : []
    })

    ipcMain.removeHandler('agent:add-host')
    ipcMain.handle('agent:add-host', async (event, topicId: string, hostId: string) => {
      this.webContents = event.sender
      const topic = topicDB.getTopicById(topicId)
      if (!topic) throw new Error('Topic not found')

      const host = hostDB.getHostById(hostId)
      if (!host) throw new Error('Host not found')

      if (!topic.hostIds.includes(hostId)) {
        topicDB.updateTopicHosts(topicId, [...topic.hostIds, hostId])
      }

      await this.ensureSession(topicId, hostId, host.alias)
      return true
    })

    ipcMain.removeHandler('agent:remove-host')
    ipcMain.handle('agent:remove-host', (_, topicId: string, hostId: string) => {
      const topic = topicDB.getTopicById(topicId)
      if (!topic) throw new Error('Topic not found')

      topicDB.updateTopicHosts(
        topicId,
        topic.hostIds.filter((id) => id !== hostId)
      )

      const sessions = this.topicSessions.get(topicId)
      if (sessions) {
        const session = sessions.get(hostId)
        if (session) {
          closeSession(session.sessionId)
          sessions.delete(hostId)
        }
      }

      return true
    })
  }

  private async ensureSession(topicId: string, hostId: string, hostAlias: string): Promise<string> {
    let topicMap = this.topicSessions.get(topicId)
    if (!topicMap) {
      topicMap = new Map()
      this.topicSessions.set(topicId, topicMap)
    }

    const existing = topicMap.get(hostId)
    if (existing) {
      return existing.sessionId
    }

    if (!this.webContents) {
      throw new Error('WebContents not available')
    }

    const sessionId = await createAgentSession(hostId, this.webContents)
    topicMap.set(hostId, { sessionId, hostId, hostAlias })

    if (this.webContents) {
      this.webContents.send('agent:session-created', { topicId, hostId, hostAlias, sessionId })
    }

    return sessionId
  }

  private async requestAuthorization(command: string): Promise<boolean> {
    if (!this.webContents) return false
    const requestId = `auth_${Date.now()}`
    this.webContents.send('agent:auth-request', requestId, command)

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve)
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          resolve(false)
          this.pendingRequests.delete(requestId)
        }
      }, 60000)
    })
  }

  private isCommandSafe(command: string): boolean {
    const unsafeKeywords = [
      'sudo',
      'rm ',
      'format',
      'dd ',
      'shutdown',
      'reboot',
      'mkfs',
      'chmod',
      'chown',
      'wget',
      'curl',
      'mv ',
      'cp ',
      'tar ',
      'kill',
      'pkill',
      'systemctl stop',
      'systemctl disable'
    ]
    return !unsafeKeywords.some((kw) => command.toLowerCase().includes(kw))
  }

  private async summarizeTopic(topicId: string, firstMessage: string) {
    try {
      const aiClient = getAIClient()
      const model = getCurrentModel()
      const response = await aiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              "Summarize the user's goal or topic into a 2-4 word title in English based on their message. No full sentences, just a title."
          },
          { role: 'user', content: firstMessage }
        ]
      })

      const title = response.choices[0].message.content?.trim().replace(/"/g, '') || 'New Session'
      topicDB.updateTopicTitle(topicId, title)

      if (this.webContents) {
        this.webContents.send('topic-updated', { topicId, title })
      }
    } catch (err) {
      console.error('Summarization Error:', err)
    }
  }

  private async processMessage(topicId: string, content: string): Promise<Message> {
    const notifyStep = (msg: Message) => {
      if (this.webContents) this.webContents.send('agent:step', msg)
    }

    const userMessage: Message = {
      id: uuidv4(),
      topicId,
      role: 'user',
      content,
      timestamp: Date.now()
    }
    messageDB.createMessage(userMessage)

    const topic = topicDB.getTopicById(topicId)
    if (topic && topic.title.includes('Session')) {
      this.summarizeTopic(topicId, content)
    }

    const history = messageDB.getMessages(topicId)
    const hosts = hostDB.getHosts()
    const hostContext = hosts
      .map((h) => `${h.alias} (ID: ${h.id}, IP: ${h.ip}, User: ${h.username})`)
      .join('\n')

    const aiMessages: any[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nAvailable Hosts:\n${hostContext}` },
      ...history.map((m) => {
        const msg: any = { role: m.role, content: m.content }
        if (m.toolCalls) msg.tool_calls = m.toolCalls
        if (m.toolCallId) msg.tool_call_id = m.toolCallId
        if (m.name) msg.name = m.name
        return msg
      })
    ]

    const tools: any[] = [
      {
        type: 'function',
        function: {
          name: 'ssh_execute',
          description:
            'Execute a shell command on a remote host via SSH using an interactive shell session',
          parameters: {
            type: 'object',
            properties: {
              hostId: { type: 'string', description: 'The unique ID of the host' },
              command: { type: 'string', description: 'The shell command to execute' }
            },
            required: ['hostId', 'command']
          }
        }
      }
    ]

    try {
      const aiClient = getAIClient()
      const model = getCurrentModel()
      const response = await aiClient.chat.completions.create({
        model,
        messages: aiMessages,
        tools,
        tool_choice: 'auto'
      })

      const assistantMessage = response.choices[0].message
      let thought = assistantMessage.content || ''
      const tool_calls = assistantMessage.tool_calls || []

      if (tool_calls.length > 0) {
        const assistantToolCallMsg: Message = {
          id: uuidv4(),
          topicId,
          role: 'assistant',
          content: assistantMessage.content || '',
          thought: assistantMessage.content || '',
          toolCalls: tool_calls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          })),
          timestamp: Date.now()
        }
        messageDB.createMessage(assistantToolCallMsg)
        notifyStep(assistantToolCallMsg)

        const toolResults = await Promise.all(
          tool_calls.map(async (call: any) => {
            const args = JSON.parse(call.function?.arguments || '{}')
            let result = ''

            if (!this.isCommandSafe(args.command)) {
              const approved = await this.requestAuthorization(args.command)
              if (!approved) {
                result = 'Error: Command execution REJECTED by user for security reasons.'
              }
            }

            if (!result && this.webContents) {
              try {
                const host = hostDB.getHostById(args.hostId)
                if (!host) {
                  result = 'Error: Host not found'
                } else {
                  const sessionId = await this.ensureSession(topicId, args.hostId, host.alias)

                  this.webContents.send('agent:terminal-show', {
                    sessionId,
                    hostId: args.hostId,
                    hostAlias: host.alias,
                    command: args.command
                  })

                  result = await executeAgentCommand(sessionId, args.command, this.webContents)

                  this.webContents.send('agent:terminal-hide', { sessionId })
                }
              } catch (err) {
                result = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
              }
            }

            const toolMsg: Message = {
              id: uuidv4(),
              topicId,
              role: 'tool',
              toolCallId: call.id,
              name: 'ssh_execute',
              content: result,
              timestamp: Date.now()
            }
            messageDB.createMessage(toolMsg)
            notifyStep(toolMsg)

            return {
              tool_call_id: call.id,
              role: 'tool',
              name: 'ssh_execute',
              content: result
            }
          })
        )

        const secondResponse = await aiClient.chat.completions.create({
          model,
          messages: [...aiMessages, assistantMessage, ...toolResults]
        })

        const finalAssistantMsg: Message = {
          id: uuidv4(),
          topicId,
          role: 'assistant',
          content: secondResponse.choices[0].message.content || '',
          thought,
          timestamp: Date.now()
        }
        messageDB.createMessage(finalAssistantMsg)
        notifyStep(finalAssistantMsg)
        return finalAssistantMsg
      }

      const finalMsg: Message = {
        id: uuidv4(),
        topicId,
        role: 'assistant',
        content: assistantMessage.content || "I couldn't process your request.",
        timestamp: Date.now()
      }
      messageDB.createMessage(finalMsg)
      notifyStep(finalMsg)
      return finalMsg
    } catch (err) {
      console.error('AI Error:', err)
      const errorMsg: Message = {
        id: uuidv4(),
        topicId,
        role: 'assistant',
        content: `Sorry, there was an error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      }
      return errorMsg
    }
  }
}
