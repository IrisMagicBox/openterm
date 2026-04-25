import { ipcMain } from 'electron'
import type { AgentService } from '../agent'
import type { TerminalSessionDeletedBy } from '../../shared/types'

export class AgentIpcController {
  constructor(private readonly service: AgentService) {}

  register(): void {
    ipcMain.removeHandler('agent:get-topic-hosts')
    ipcMain.handle('agent:get-topic-hosts', (_, topicId: string) =>
      this.service.getTopicHosts(topicId)
    )

    ipcMain.removeHandler('agent:add-host')
    ipcMain.handle('agent:add-host', (_, topicId: string, hostId: string) =>
      this.service.addHostToTopic(topicId, hostId)
    )

    ipcMain.removeHandler('agent:remove-host')
    ipcMain.handle('agent:remove-host', (_, topicId: string, hostId: string) =>
      this.service.removeHostFromTopic(topicId, hostId)
    )

    ipcMain.removeHandler('agent:message')
    ipcMain.handle('agent:message', (_, topicId: string, content: string) =>
      this.service.handleMessage(topicId, content)
    )

    ipcMain.removeHandler('agent:auth-response')
    ipcMain.handle(
      'agent:auth-response',
      (_, requestId: string, approved: boolean, alwaysAllow?: boolean) =>
        this.service.handleAuthResponse(requestId, approved, alwaysAllow)
    )

    ipcMain.removeHandler('agent:get-sessions')
    ipcMain.handle('agent:get-sessions', (_, topicId: string) => this.service.getSessions(topicId))

    ipcMain.removeHandler('agent:create-terminal')
    ipcMain.handle('agent:create-terminal', (_, topicId: string, hostId: string, name?: string) =>
      this.service.createTerminal(topicId, hostId, name)
    )

    ipcMain.removeHandler('agent:close-terminal')
    ipcMain.handle('agent:close-terminal', (_, id: string, deletedBy?: TerminalSessionDeletedBy) =>
      this.service.closeTerminal(id, { deletedBy })
    )

    ipcMain.removeHandler('agent:rename-terminal')
    ipcMain.handle('agent:rename-terminal', (_, id: string, name: string) =>
      this.service.renameTerminal(id, name)
    )

    ipcMain.removeHandler('agent:toggle-terminal-pin')
    ipcMain.handle('agent:toggle-terminal-pin', (_, id: string, isPinned: boolean) =>
      this.service.toggleTerminalPin(id, isPinned)
    )

    ipcMain.removeHandler('agent:set-session-paused')
    ipcMain.handle('agent:set-session-paused', async (_, id: string, paused: boolean) => {
      await this.service.setPaused(id, paused)
      return true
    })

    ipcMain.removeHandler('agent:is-session-paused')
    ipcMain.handle('agent:is-session-paused', (_, id: string) => this.service.isPaused(id))
  }
}
