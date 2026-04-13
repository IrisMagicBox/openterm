import { ipcMain } from 'electron'
import { getRecoverableSessions } from '../session-recovery'

export function registerSessionIPC(): void {
  ipcMain.removeHandler('session:get-recoverable')
  ipcMain.handle('session:get-recoverable', () => {
    return getRecoverableSessions()
  })
}
