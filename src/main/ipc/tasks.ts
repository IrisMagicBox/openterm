import { ipcMain } from 'electron'
import { taskDB } from '../db'

export function registerTaskIPC(): void {
  ipcMain.removeHandler('get-tasks')
  ipcMain.handle('get-tasks', (_, topicId?: string) => taskDB.getTasks(topicId))

  ipcMain.removeHandler('get-latest-task')
  ipcMain.handle('get-latest-task', (_, topicId: string) => taskDB.getLatestTaskByTopicId(topicId))

  ipcMain.removeHandler('create-task')
  ipcMain.handle('create-task', (_, task) => taskDB.createTask(task))

  ipcMain.removeHandler('update-task')
  ipcMain.handle('update-task', (_, id, updates) => taskDB.updateTask(id, updates))
}
