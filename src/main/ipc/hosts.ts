import { ipcMain } from 'electron'
import { hostDB } from '../db'
import { removeStoredSSHKey } from '../utils/ssh-key-store'
import { getUserDataPath } from '../utils/app-paths'

function removeStoredHostKey(id: string): void {
  removeStoredSSHKey(getUserDataPath(), id)
}

export function registerHostIPC(): void {
  ipcMain.removeHandler('get-hosts')
  ipcMain.handle('get-hosts', () => hostDB.getHosts())

  ipcMain.removeHandler('create-host')
  ipcMain.handle('create-host', (_, host) => hostDB.createHost(host))

  ipcMain.removeHandler('update-host')
  ipcMain.handle('update-host', (_, id, updates) => {
    const updatedHost = hostDB.updateHost(id, updates)
    if (
      updates &&
      Object.prototype.hasOwnProperty.call(updates, 'keyContent') &&
      !updates.keyContent
    ) {
      removeStoredHostKey(id)
    }
    return updatedHost
  })

  ipcMain.removeHandler('delete-host')
  ipcMain.handle('delete-host', (_, id) => {
    hostDB.deleteHost(id)
    removeStoredHostKey(id)
  })
}
