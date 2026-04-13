import { ipcMain } from 'electron'
import { permissionDB } from '../db'

export function registerSettingsIPC(): void {
  ipcMain.removeHandler('get-permissions')
  ipcMain.handle('get-permissions', () => permissionDB.getPermissions())

  ipcMain.removeHandler('save-permissions')
  ipcMain.handle('save-permissions', (_, permissions) => {
    permissionDB.savePermissions(permissions)
  })
}
