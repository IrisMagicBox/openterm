import { ipcMain } from 'electron'
import { topicDB } from '../db'

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
  ipcMain.handle('delete-topic', (_, topicId) => topicDB.deleteTopic(topicId))

  ipcMain.removeHandler('update-topic-hosts')
  ipcMain.handle('update-topic-hosts', (_, topicId, hostIds) =>
    topicDB.updateTopicHosts(topicId, hostIds)
  )
}
