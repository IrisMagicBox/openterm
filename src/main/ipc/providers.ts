import { ipcMain } from 'electron'
import { providerDB } from '../db'
import { fetchProviderModels, testProviderConnection } from '../ai'

export function registerProviderIPC(): void {
  ipcMain.removeHandler('get-providers')
  ipcMain.handle('get-providers', () => providerDB.getProviders())

  ipcMain.removeHandler('get-provider')
  ipcMain.handle('get-provider', (_, id) => providerDB.getProviderById(id))

  ipcMain.removeHandler('save-provider')
  ipcMain.handle('save-provider', (_, provider) => providerDB.saveProvider(provider))

  ipcMain.removeHandler('delete-provider')
  ipcMain.handle('delete-provider', (_, id) => providerDB.deleteProvider(id))

  ipcMain.removeHandler('test-provider-connection')
  ipcMain.handle('test-provider-connection', (_, provider, modelId?: string) =>
    testProviderConnection(provider, modelId)
  )

  ipcMain.removeHandler('fetch-provider-models')
  ipcMain.handle('fetch-provider-models', (_, provider) => fetchProviderModels(provider))
}
