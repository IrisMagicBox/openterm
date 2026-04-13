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
import { registerPortForwardIPC } from './port-forward'
import { handleSessionRecovery } from './session-recovery'
import { logger } from './logger'
import { registerAllIPC } from './ipc'

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
  if (process.platform === 'darwin') {
    const icnsPath = is.dev
      ? join(process.cwd(), 'build/icon.icns')
      : join(process.resourcesPath, 'icon.icns')
    const dockIcon = nativeImage.createFromPath(icnsPath)
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon)
    else {
      const pngIcon = nativeImage.createFromPath(icon)
      if (!pngIcon.isEmpty()) app.dock?.setIcon(pngIcon)
    }
  }

  initializeDB()
  registerAllIPC()
  setupSSHHandlers()
  setupAgentHandlers()
  registerLocalTerminalIPC()
  registerSFTPIPC()
  registerPortForwardIPC()
  setAgentService(agentService)
  setCreateAgentSession(createAgentSession)

  electronApp.setAppUserModelId('com.openterm')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
