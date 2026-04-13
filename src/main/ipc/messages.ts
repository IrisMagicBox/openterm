import { ipcMain } from 'electron'
import { messageDB } from '../db'

export function registerMessageIPC(): void {
  ipcMain.removeHandler('get-messages')
  ipcMain.handle('get-messages', (_, topicId) => messageDB.getMessages(topicId))
}
