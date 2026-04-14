import { ipcMain } from 'electron'
import { logger } from './logger'

export function registerLocalFsIPC(): void {
  ipcMain.handle('local-fs:connect', async () => {
    const sessionId = `local-fs-${Date.now()}`
    logger.info('LocalFS', `Session created: ${sessionId}`)
    return { sessionId, hostId: 'local' }
  })

  ipcMain.handle('local-fs:list', async (_, _sessionId: string, dirPath: string) => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name)
        try {
          const stat = await fs.stat(fullPath)
          return {
            name: entry.name,
            type: (entry.isDirectory() ? 'directory' : 'file') as 'directory' | 'file',
            size: stat.size,
            modifyTime: stat.mtimeMs,
            permissions: stat.mode
          }
        } catch {
          return {
            name: entry.name,
            type: 'file' as const,
            size: 0,
            modifyTime: 0,
            permissions: 0
          }
        }
      })
    )
    return results
  })

  ipcMain.handle(
    'local-fs:upload',
    async (_, _sessionId: string, localPath: string, remotePath: string) => {
      const fs = await import('fs/promises')
      await fs.copyFile(localPath, remotePath)
    }
  )

  ipcMain.handle(
    'local-fs:download',
    async (_, _sessionId: string, remotePath: string, localPath: string) => {
      const fs = await import('fs/promises')
      await fs.copyFile(remotePath, localPath)
    }
  )

  ipcMain.handle('local-fs:mkdir', async (_, _sessionId: string, dirPath: string) => {
    const fs = await import('fs/promises')
    await fs.mkdir(dirPath, { recursive: true })
  })

  ipcMain.handle('local-fs:delete', async (_, _sessionId: string, itemPath: string) => {
    const fs = await import('fs/promises')
    const stat = await fs.stat(itemPath)
    if (stat.isDirectory()) {
      await fs.rm(itemPath, { recursive: true })
    } else {
      await fs.unlink(itemPath)
    }
  })

  ipcMain.handle('local-fs:close', async () => {
    return true
  })
  
  ipcMain.on('local-fs:start-native-drag', (event, filePath: string, iconPath?: string) => {
    const path = require('path')
    event.sender.startDrag({
      file: filePath,
      icon: iconPath || path.join(__dirname, '../../resources/icon.png') // TODO: better icon
    })
  })

  logger.info('LocalFS', 'IPC handlers registered')
}
