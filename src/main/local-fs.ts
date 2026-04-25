import { ipcMain, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { logger } from './logger'

const DRAG_ICON_SIZE = 32
const DEFAULT_DRAG_ICON_PATH = path.join(__dirname, '../../resources/icon.png')

let defaultDragIcon: NativeImage | null = null

function expandUserPath(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

function createDragIcon(iconPath: string): NativeImage | null {
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return null
  return image.resize({ width: DRAG_ICON_SIZE, height: DRAG_ICON_SIZE, quality: 'best' })
}

function getDefaultDragIcon(): NativeImage | string {
  defaultDragIcon ??= createDragIcon(DEFAULT_DRAG_ICON_PATH)
  return defaultDragIcon || DEFAULT_DRAG_ICON_PATH
}

function getDragIcon(iconPath?: string): NativeImage | string {
  if (iconPath) {
    const customIcon = createDragIcon(expandUserPath(iconPath))
    if (customIcon) return customIcon
  }
  return getDefaultDragIcon()
}

export function registerLocalFsIPC(): void {
  ipcMain.handle('local-fs:connect', async () => {
    const sessionId = `local-fs-${Date.now()}`
    logger.info('LocalFS', `Session created: ${sessionId}`)
    return { sessionId, hostId: 'local', homeDir: os.homedir() }
  })

  ipcMain.handle('local-fs:list', async (_, _sessionId: string, dirPath: string) => {
    const fs = await import('fs/promises')
    const expandedDirPath = expandUserPath(dirPath)
    const entries = await fs.readdir(expandedDirPath, { withFileTypes: true })
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(expandedDirPath, entry.name)
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
      await fs.copyFile(expandUserPath(localPath), expandUserPath(remotePath))
    }
  )

  ipcMain.handle(
    'local-fs:download',
    async (_, _sessionId: string, remotePath: string, localPath: string) => {
      const fs = await import('fs/promises')
      await fs.copyFile(expandUserPath(remotePath), expandUserPath(localPath))
    }
  )

  ipcMain.handle('local-fs:mkdir', async (_, _sessionId: string, dirPath: string) => {
    const fs = await import('fs/promises')
    await fs.mkdir(expandUserPath(dirPath), { recursive: true })
  })

  ipcMain.handle('local-fs:delete', async (_, _sessionId: string, itemPath: string) => {
    const fs = await import('fs/promises')
    const expandedItemPath = expandUserPath(itemPath)
    const stat = await fs.stat(expandedItemPath)
    if (stat.isDirectory()) {
      await fs.rm(expandedItemPath, { recursive: true })
    } else {
      await fs.unlink(expandedItemPath)
    }
  })

  ipcMain.handle('local-fs:close', async () => {
    return true
  })

  ipcMain.on('local-fs:start-native-drag', (event, filePath: string, iconPath?: string) => {
    event.sender.startDrag({
      file: expandUserPath(filePath),
      icon: getDragIcon(iconPath)
    })
  })

  logger.info('LocalFS', 'IPC handlers registered')
}
