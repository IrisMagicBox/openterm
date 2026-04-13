import { ipcMain } from 'electron'
import { terminalIODB } from '../db'

export function registerSearchIPC(): void {
  ipcMain.removeHandler('search-commands')
  ipcMain.handle('search-commands', (_, query: string, limit?: number) => {
    return terminalIODB.searchCommandInputs(query, limit)
  })
}
