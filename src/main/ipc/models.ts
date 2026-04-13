import { ipcMain } from 'electron'
import { modelSettingsDB, modelDB } from '../db'

export function registerModelIPC(): void {
  ipcMain.removeHandler('get-model-settings')
  ipcMain.handle('get-model-settings', () => modelSettingsDB.getSettings())

  ipcMain.removeHandler('save-model-settings')
  ipcMain.handle('save-model-settings', (_, settings) => {
    modelSettingsDB.saveSettings(settings)
  })

  ipcMain.removeHandler('get-models')
  ipcMain.handle('get-models', (_, providerId) => modelDB.getModels(providerId))

  ipcMain.removeHandler('save-model')
  ipcMain.handle('save-model', (_, model) => modelDB.saveModel(model))

  ipcMain.removeHandler('delete-model')
  ipcMain.handle('delete-model', (_, id) => modelDB.deleteModel(id))
}
