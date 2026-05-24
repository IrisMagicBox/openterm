import { app, shell, BrowserWindow, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT } from './constants'
import { initializeDB } from './db'
import {
  setupSSHHandlers,
  setAgentService,
  createAgentSession,
  closeSession as closeSSHSession
} from './ssh'
import {
  setupAgentHandlers,
  agentService,
  setCreateAgentSession,
  setCloseTerminalSession
} from './agent'
import { registerLocalTerminalIPC, setLocalAgentService, closeLocalSession } from './local-terminal'
import { registerSFTPIPC } from './sftp'
import { registerLocalFsIPC } from './local-fs'
import { registerPortForwardIPC } from './port-forward'
import { startCliControlServer, stopCliControlServer } from './cli-control-server'
import { handleSessionRecovery } from './session-recovery'
import { logger } from './logger'
import { registerAllIPC } from './ipc'

const APP_ID = 'com.eddic.openterm'
const APP_NAME = 'OpenTerm'
const MAC_WINDOW_VIBRANCY = 'sidebar' as const
const RENDERER_DIAGNOSTIC_LIMIT = 4000

app.setName(APP_NAME)

process.env.OPENTERM_USER_DATA_PATH = app.getPath('userData')

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

function truncateDiagnosticText(value: unknown, limit = RENDERER_DIAGNOSTIC_LIMIT): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}... [truncated ${text.length - limit}]` : text
}

function sanitizeRendererDiagnostic(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return { value: truncateDiagnosticText(data) }
  }

  const input = data as Record<string, unknown>
  return {
    type: truncateDiagnosticText(input.type, 120),
    message: truncateDiagnosticText(input.message),
    stack: truncateDiagnosticText(input.stack),
    componentStack: truncateDiagnosticText(input.componentStack),
    filename: truncateDiagnosticText(input.filename, 500),
    lineno: typeof input.lineno === 'number' ? input.lineno : undefined,
    colno: typeof input.colno === 'number' ? input.colno : undefined,
    href: truncateDiagnosticText(input.href, 500),
    userAgent: truncateDiagnosticText(input.userAgent, 500),
    extra: input.extra
  }
}

function registerRendererDiagnosticsIPC(): void {
  ipcMain.removeAllListeners('renderer:diagnostic')
  ipcMain.on('renderer:diagnostic', (_, data: unknown) => {
    const diagnostic = sanitizeRendererDiagnostic(data)
    const type = typeof diagnostic.type === 'string' ? diagnostic.type : ''
    if (type.startsWith('terminal-')) {
      logger.debug('Renderer', 'Renderer diagnostic event', diagnostic)
      return
    }
    logger.error('Renderer', 'Renderer diagnostic event', diagnostic)
  })
}

function describeWebContentsURL(window: BrowserWindow): Record<string, unknown> {
  try {
    return {
      id: window.id,
      url: window.webContents.getURL(),
      isLoading: window.webContents.isLoading(),
      isDestroyed: window.webContents.isDestroyed()
    }
  } catch (error) {
    return { id: window.id, error: error instanceof Error ? error.message : String(error) }
  }
}

function attachWindowDiagnostics(mainWindow: BrowserWindow): void {
  mainWindow.on('unresponsive', () => {
    logger.error('System', 'BrowserWindow became unresponsive', describeWebContentsURL(mainWindow))
  })

  mainWindow.on('responsive', () => {
    logger.warn('System', 'BrowserWindow became responsive again', describeWebContentsURL(mainWindow))
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    logger.error('System', 'Renderer process gone', {
      ...describeWebContentsURL(mainWindow),
      reason: details.reason,
      exitCode: details.exitCode
    })
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logger.error('System', 'Renderer failed to load', {
        ...describeWebContentsURL(mainWindow),
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      })
    }
  )

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('System', 'Renderer finished loading', describeWebContentsURL(mainWindow))
  })

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    if (level < 2) return
    logger.warn('RendererConsole', truncateDiagnosticText(message), {
      level,
      line,
      sourceId: truncateDiagnosticText(sourceId, 500)
    })
  })
}

function registerProcessDiagnostics(): void {
  app.on('child-process-gone', (_, details) => {
    logger.error('System', 'Electron child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name
    })
  })
}

function createWindow(): void {
  const macWindowMaterial =
    process.platform === 'darwin'
      ? {
          transparent: true,
          backgroundColor: '#00000000',
          vibrancy: MAC_WINDOW_VIBRANCY,
          visualEffectState: 'active' as const,
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 18, y: 18 }
        }
      : {
          titleBarStyle: 'hiddenInset' as const
        }

  const mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    ...macWindowMaterial,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })

  attachWindowDiagnostics(mainWindow)

  if (process.platform === 'darwin') {
    mainWindow.setBackgroundColor('#00000000')
    mainWindow.setVibrancy(MAC_WINDOW_VIBRANCY, { animationDuration: 0 })
  }

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
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!input.meta && !input.control) return
    if (input.alt) return

    const key = input.key.toLowerCase()
    const code = input.code
    const isZoomIn = key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd'
    const isZoomOut = key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract'
    const isZoomReset = key === '0' || code === 'Digit0' || code === 'Numpad0'

    if (!isZoomIn && !isZoomOut && !isZoomReset) return

    event.preventDefault()
    mainWindow.webContents.send('app:zoom-shortcut', {
      direction: isZoomIn ? 'in' : isZoomOut ? 'out' : 'reset'
    })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  setMacDockIcon()
  registerProcessDiagnostics()

  initializeDB()
  registerAllIPC()
  registerRendererDiagnosticsIPC()
  setupSSHHandlers()
  setupAgentHandlers()
  registerLocalTerminalIPC()
  registerSFTPIPC()
  registerLocalFsIPC()
  registerPortForwardIPC()
  setAgentService(agentService)
  setLocalAgentService(agentService)
  setCreateAgentSession(createAgentSession)
  setCloseTerminalSession((session, deletedBy) => {
    if (session.hostId === 'local') return closeLocalSession(session.id, deletedBy)
    return closeSSHSession(session.id, deletedBy)
  })
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
