import { ipcMain } from 'electron'
import { terminalSessionDB, topicDB } from '../db'
import { agentService } from '../agent'

export function registerTopicIPC(): void {
  ipcMain.removeHandler('get-topics')
  ipcMain.handle('get-topics', () => topicDB.getTopics())

  ipcMain.removeHandler('create-topic')
  ipcMain.handle('create-topic', (_, title, hostIds) => topicDB.createTopic(title, hostIds))

  ipcMain.removeHandler('update-topic-title')
  ipcMain.handle('update-topic-title', (_, topicId, title) =>
    topicDB.updateTopicTitle(topicId, title)
  )

  ipcMain.removeHandler('delete-topic')
  ipcMain.handle('delete-topic', async (_, topicId) => {
    // 1. Close all active terminal processes first
    const sessions = terminalSessionDB.getActiveSessionsByTopic(topicId)
    await Promise.all(
      sessions.map((session) => agentService.closeTerminal(session.id, { deletedBy: 'user' }))
    )

    // 2. Delete from DB (cascades will handle messages, sessions, etc.)
    return topicDB.deleteTopic(topicId)
  })

  ipcMain.handle('update-topic-hosts', (_, topicId, hostIds) =>
    topicDB.updateTopicHosts(topicId, hostIds)
  )

  ipcMain.removeHandler('update-topic-model')
  ipcMain.handle('update-topic-model', (_, topicId, providerId, modelId) =>
    topicDB.updateTopicModel(topicId, providerId, modelId)
  )
}
