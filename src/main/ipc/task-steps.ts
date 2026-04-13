import { ipcMain } from 'electron'
import { taskStepDB } from '../db'

export function registerTaskStepIPC(): void {
  ipcMain.removeHandler('get-task-steps')
  ipcMain.handle('get-task-steps', (_, taskId: string) => taskStepDB.getTaskSteps(taskId))

  ipcMain.removeHandler('create-task-step')
  ipcMain.handle('create-task-step', (_, step) => taskStepDB.createStep(step))

  ipcMain.removeHandler('update-task-step')
  ipcMain.handle('update-task-step', (_, id, updates) => taskStepDB.updateStep(id, updates))
}
