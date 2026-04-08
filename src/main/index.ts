import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  initializeDB,
  hostDB,
  topicDB,
  messageDB,
  modelSettingsDB,
  providerDB,
  modelDB
} from './db'
import { setupSSHHandlers } from './ssh'
import { AgentService } from './agent'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset', // Modern macOS look
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Register Global IPC Handlers (Once)
  ipcMain.removeHandler('get-messages')
  ipcMain.handle('get-messages', (_, topicId) => messageDB.getMessages(topicId))

  // SSH and Agent handlers are now initialized once in whenReady()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize Database
  initializeDB()

  // Register Global IPC Handlers (Once)
  setupSSHHandlers()
  new AgentService()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.openterm')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Host IPC Handlers
  ipcMain.removeHandler('get-hosts')
  ipcMain.handle('get-hosts', () => hostDB.getHosts())
  ipcMain.removeHandler('create-host')
  ipcMain.handle('create-host', (_, host) => hostDB.createHost(host))
  ipcMain.removeHandler('delete-host')
  ipcMain.handle('delete-host', (_, id) => hostDB.deleteHost(id))

  // Topic IPC Handlers
  ipcMain.removeHandler('get-topics')
  ipcMain.handle('get-topics', () => topicDB.getTopics())
  ipcMain.removeHandler('create-topic')
  ipcMain.handle('create-topic', (_, title, hostIds) => topicDB.createTopic(title, hostIds))
  ipcMain.removeHandler('update-topic-hosts')
  ipcMain.handle('update-topic-hosts', (_, topicId, hostIds) =>
    topicDB.updateTopicHosts(topicId, hostIds)
  )

  ipcMain.removeHandler('get-model-settings')
  ipcMain.handle('get-model-settings', () => modelSettingsDB.getSettings())
  ipcMain.removeHandler('save-model-settings')
  ipcMain.handle('save-model-settings', (_, settings) => {
    modelSettingsDB.saveSettings(settings)
  })

  ipcMain.removeHandler('get-providers')
  ipcMain.handle('get-providers', () => providerDB.getProviders())
  ipcMain.removeHandler('get-provider')
  ipcMain.handle('get-provider', (_, id) => providerDB.getProviderById(id))
  ipcMain.removeHandler('save-provider')
  ipcMain.handle('save-provider', (_, provider) => providerDB.saveProvider(provider))
  ipcMain.removeHandler('delete-provider')
  ipcMain.handle('delete-provider', (_, id) => providerDB.deleteProvider(id))

  ipcMain.removeHandler('get-models')
  ipcMain.handle('get-models', (_, providerId) => modelDB.getModels(providerId))
  ipcMain.removeHandler('save-model')
  ipcMain.handle('save-model', (_, model) => modelDB.saveModel(model))
  ipcMain.removeHandler('delete-model')
  ipcMain.handle('delete-model', (_, id) => modelDB.deleteModel(id))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
