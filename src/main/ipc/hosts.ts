import { ipcMain } from 'electron'
import { hostDB } from '../db'

export function registerHostIPC(): void {
  ipcMain.removeHandler('get-hosts')
  ipcMain.handle('get-hosts', () => hostDB.getHosts())

  ipcMain.removeHandler('create-host')
  ipcMain.handle('create-host', (_, host) => hostDB.createHost(host))

  ipcMain.removeHandler('delete-host')
  ipcMain.handle('delete-host', (_, id) => hostDB.deleteHost(id))
}
