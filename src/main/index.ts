import { app, shell, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT } from './constants'
import { initializeDB } from './db'
import { setupSSHHandlers, setAgentService, createAgentSession } from './ssh'
import { setupAgentHandlers, agentService, setCreateAgentSession } from './agent'
import { registerLocalTerminalIPC } from './local-terminal'
import { registerSFTPIPC } from './sftp'
import { registerLocalFsIPC } from './local-fs'
import { registerPortForwardIPC } from './port-forward'
import { startCliControlServer, stopCliControlServer } from './cli-control-server'
import { handleSessionRecovery } from './session-recovery'
import { logger } from './logger'
import { registerAllIPC } from './ipc'

const APP_ID = 'com.eddic.openterm'
const APP_NAME = 'OpenTerm'

app.setName(APP_NAME)

function setMacDockIcon(): void {
  if (process.platform !== 'darwin') return

  const dockIcon = nativeImage.createFromPath(icon)
  if (dockIcon.isEmpty()) return

  try {
    app.dock?.setIcon(dockIcon)
  } catch {
    app.whenReady().then(() => app.dock?.setIcon(dockIcon))
  }
}

setMacDockIcon()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    logger.setWebContents(mainWindow.webContents)
    agentService.setWebContents(mainWindow.webContents)
    logger.info('System', 'Main window shown, logger initialized')
    handleSessionRecovery(mainWindow.webContents)
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' as const }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  setMacDockIcon()

  initializeDB()
  registerAllIPC()
  setupSSHHandlers()
  setupAgentHandlers()
  registerLocalTerminalIPC()
  registerSFTPIPC()
  registerLocalFsIPC()
  registerPortForwardIPC()
  setAgentService(agentService)
  setCreateAgentSession(createAgentSession)
  startCliControlServer(agentService)

  electronApp.setAppUserModelId(APP_ID)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopCliControlServer()
})
