import { ipcMain } from 'electron'
import { taskStepDB } from '../db'

export function registerTaskStepIPC(): void {
  ipcMain.removeHandler('get-task-steps')
  ipcMain.handle('get-task-steps', (_, taskId: string) => taskStepDB.getTaskSteps(taskId))
}
