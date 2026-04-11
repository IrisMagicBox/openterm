import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
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
  modelDB,
  permissionDB,
  taskDB,
  taskStepDB,
  approvalDB,
  artifactDB,
  terminalIODB
} from './db'
import { setupSSHHandlers, setAgentService, createAgentSession } from './ssh'
import { setupAgentHandlers, agentService, setCreateAgentSession } from './agent'
import { registerLocalTerminalIPC } from './local-terminal'
import { registerSFTPIPC } from './sftp'
import { registerPortForwardIPC } from './port-forward'
import { recoverSessions, getRecoverableSessions } from './session-recovery'
import { logger } from './logger'
import { buildProviderChatUrl } from './ai'
import type { Provider } from '../shared/types'

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
    logger.setWebContents(mainWindow.webContents)
    agentService.setWebContents(mainWindow.webContents)
    logger.info('System', 'Main window shown, logger initialized')

    recoverSessions(mainWindow.webContents).then((results) => {
      if (results.length > 0) {
        const recovered = results.filter((r) => r.recovered)
        const failed = results.filter((r) => !r.recovered)
        
        // IMPORTANT: Register recovered sessions into AgentService memory pool
        for (const res of recovered) {
          if (res.newSessionId) {
            agentService.registerSession({
              id: res.newSessionId,
              topicId: res.originalSession.topicId,
              hostId: res.originalSession.hostId,
              hostAlias: res.originalSession.hostAlias,
              status: 'active',
              shellType: res.originalSession.shellType,
              shellIntegrationReady: false,
              createdAt: Date.now(),
              paused: false,
              name: res.originalSession.name
            })
          }
        }

        logger.info(
          'SessionRecovery',
          `Recovered ${recovered.length}/${results.length} sessions, ${failed.length} failed`
        )
        mainWindow.webContents.send('session:recovered', {
          recovered: recovered.map((r) => ({
            originalId: r.originalSession.id,
            newSessionId: r.newSessionId,
            hostAlias: r.originalSession.hostAlias,
            topicId: r.originalSession.topicId
          })),
          failed: failed.map((r) => ({
            hostAlias: r.originalSession.hostAlias,
            topicId: r.originalSession.topicId
          }))
        })
      }
    })
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
  // Set macOS dock icon
  if (process.platform === 'darwin') {
    const icnsPath = is.dev
      ? join(process.cwd(), 'build/icon.icns')
      : join(process.resourcesPath, 'icon.icns')
    console.log('[dock icon] path:', icnsPath)
    const dockIcon = nativeImage.createFromPath(icnsPath)
    console.log('[dock icon] empty?', dockIcon.isEmpty())
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon)
    } else {
      // fallback to png
      const pngIcon = nativeImage.createFromPath(icon)
      console.log('[dock icon] fallback png empty?', pngIcon.isEmpty())
      if (!pngIcon.isEmpty()) app.dock?.setIcon(pngIcon)
    }
  }

  // Initialize Database
  initializeDB()

  // Register Global IPC Handlers (Once)
  setupSSHHandlers()
  setupAgentHandlers()
  registerLocalTerminalIPC()
  registerSFTPIPC()
  registerPortForwardIPC()

  ipcMain.removeHandler('search-commands')
  ipcMain.handle('search-commands', (_, query: string, limit?: number) => {
    return terminalIODB.searchCommandInputs(query, limit)
  })

  ipcMain.removeHandler('session:get-recoverable')
  ipcMain.handle('session:get-recoverable', () => {
    return getRecoverableSessions()
  })

  // Link services to avoid circular dependencies
  setAgentService(agentService)
  setCreateAgentSession(createAgentSession)

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
  ipcMain.removeHandler('update-topic-title')
  ipcMain.handle('update-topic-title', (_, topicId, title) =>
    topicDB.updateTopicTitle(topicId, title)
  )
  ipcMain.removeHandler('delete-topic')
  ipcMain.handle('delete-topic', (_, topicId) => topicDB.deleteTopic(topicId))
  ipcMain.removeHandler('update-topic-hosts')
  ipcMain.handle('update-topic-hosts', (_, topicId, hostIds) =>
    topicDB.updateTopicHosts(topicId, hostIds)
  )

  ipcMain.removeHandler('get-tasks')
  ipcMain.handle('get-tasks', (_, topicId?: string) => taskDB.getTasks(topicId))
  ipcMain.removeHandler('get-latest-task')
  ipcMain.handle('get-latest-task', (_, topicId: string) => taskDB.getLatestTaskByTopicId(topicId))
  ipcMain.removeHandler('create-task')
  ipcMain.handle('create-task', (_, task) => taskDB.createTask(task))
  ipcMain.removeHandler('update-task')
  ipcMain.handle('update-task', (_, id, updates) => taskDB.updateTask(id, updates))

  ipcMain.removeHandler('get-task-steps')
  ipcMain.handle('get-task-steps', (_, taskId: string) => taskStepDB.getTaskSteps(taskId))
  ipcMain.removeHandler('create-task-step')
  ipcMain.handle('create-task-step', (_, step) => taskStepDB.createStep(step))
  ipcMain.removeHandler('update-task-step')
  ipcMain.handle('update-task-step', (_, id, updates) => taskStepDB.updateStep(id, updates))

  ipcMain.removeHandler('get-approvals')
  ipcMain.handle('get-approvals', (_, taskId: string) => approvalDB.getApprovalsByTaskId(taskId))
  ipcMain.removeHandler('create-approval')
  ipcMain.handle('create-approval', (_, approval) => approvalDB.createApproval(approval))
  ipcMain.removeHandler('update-approval-status')
  ipcMain.handle('update-approval-status', (_, id: string, status) =>
    approvalDB.updateApprovalStatus(id, status)
  )

  ipcMain.removeHandler('get-artifacts')
  ipcMain.handle('get-artifacts', (_, taskId: string) => artifactDB.getArtifactsByTaskId(taskId))
  ipcMain.removeHandler('create-artifact')
  ipcMain.handle('create-artifact', (_, artifact) => artifactDB.createArtifact(artifact))

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
  ipcMain.removeHandler('test-provider-connection')
  ipcMain.handle('test-provider-connection', async (_, provider: Provider, modelId?: string) => {
    try {
      const chatUrl = buildProviderChatUrl(provider)
      if (!chatUrl) return { ok: false, message: 'API Host is required.' }

      // Get model to test
      const models = modelDB.getModels(provider.id)
      let testModel = modelId || (models.length > 0 ? models[0].id : '')

      if (!testModel) {
        // Fallback defaults for testing if no models configured
        if (provider.id === 'openai' || provider.type === 'openai') testModel = 'gpt-4o-mini'
        else if (provider.id === 'anthropic' || provider.type === 'anthropic')
          testModel = 'claude-3-haiku-20240307'
        else if (provider.id === 'deepseek') testModel = 'deepseek-chat'
        else if (provider.id === 'groq') testModel = 'llama3-8b-8192'
      }

      if (!testModel && provider.type !== 'gemini') {
        return { ok: false, message: '请先在该提供商下添加至少一个模型以进行对话测试。' }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      let body: any = {}

      if (provider.type === 'anthropic') {
        headers['x-api-key'] = provider.apiKey || ''
        headers['anthropic-version'] = '2023-06-01'
        body = {
          model: testModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        }
      } else if (provider.type === 'gemini') {
        // Gemini specific quick test
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${provider.apiKey || ''}`
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'hi' }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        })
        const data: any = await response.json()
        if (data.error) return { ok: false, message: data.error.message || 'Gemini API Error' }
        return {
          ok: response.ok,
          message: response.ok ? 'Connection successful.' : `HTTP ${response.status}`
        }
      } else {
        // OpenAI format (default)
        if (provider.apiKey) {
          headers.Authorization = `Bearer ${provider.apiKey}`
        }
        body = {
          model: testModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      try {
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        const data: any = await response.json().catch(() => ({}))

        if (!response.ok) {
          const errorMsg = data.error?.message || data.error || response.statusText
          return { ok: false, message: `HTTP ${response.status}: ${errorMsg}` }
        }

        if (data.error) {
          return { ok: false, message: data.error.message || 'API error' }
        }

        return { ok: true, message: `连接成功！已通过模型 ${testModel} 完成对话测试。` }
      } catch (error: any) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
          return {
            ok: false,
            message: '连接超时（20秒）。这可能是因为 API 地址不通或模型响应过慢。'
          }
        }
        throw error
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : '未知连接错误'
      }
    }
  })

  ipcMain.removeHandler('get-models')
  ipcMain.handle('get-models', (_, providerId) => modelDB.getModels(providerId))
  ipcMain.removeHandler('save-model')
  ipcMain.handle('save-model', (_, model) => modelDB.saveModel(model))
  ipcMain.removeHandler('delete-model')
  ipcMain.handle('delete-model', (_, id) => modelDB.deleteModel(id))

  // Permission Settings IPC Handlers
  ipcMain.removeHandler('get-permissions')
  ipcMain.handle('get-permissions', () => permissionDB.getPermissions())
  ipcMain.removeHandler('save-permissions')
  ipcMain.handle('save-permissions', (_, permissions) => {
    permissionDB.savePermissions(permissions)
  })

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
// code. You can put them in separate files and require them here.
