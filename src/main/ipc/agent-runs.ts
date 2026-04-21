import { ipcMain } from 'electron'
import { agentPartDB, agentRunDB } from '../db'
import { agentService } from '../agent'

export function registerAgentRunIPC(): void {
  ipcMain.removeHandler('agent:get-run')
  ipcMain.handle('agent:get-run', (_, runId: string) => agentRunDB.getRun(runId))

  ipcMain.removeHandler('agent:get-runs-by-task')
  ipcMain.handle('agent:get-runs-by-task', (_, taskId: string) => agentRunDB.getRunsByTask(taskId))

  ipcMain.removeHandler('agent:get-run-parts')
  ipcMain.handle('agent:get-run-parts', (_, runId: string) => agentPartDB.getPartsByRun(runId))

  ipcMain.removeHandler('agent:get-task-parts')
  ipcMain.handle('agent:get-task-parts', (_, taskId: string) => agentPartDB.getPartsByTask(taskId))

  ipcMain.removeHandler('agent:cancel-run')
  ipcMain.handle('agent:cancel-run', (_, runId: string) => agentService.cancelRun(runId))

  ipcMain.removeHandler('agent:resume-run')
  ipcMain.handle('agent:resume-run', (_, runId: string) => agentService.resumeRun(runId))
}
