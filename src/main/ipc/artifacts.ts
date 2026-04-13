import { ipcMain } from 'electron'
import { artifactDB } from '../db'

export function registerArtifactIPC(): void {
  ipcMain.removeHandler('get-artifacts')
  ipcMain.handle('get-artifacts', (_, taskId: string) => artifactDB.getArtifactsByTaskId(taskId))

  ipcMain.removeHandler('create-artifact')
  ipcMain.handle('create-artifact', (_, artifact) => artifactDB.createArtifact(artifact))
}
