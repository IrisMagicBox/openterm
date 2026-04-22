import { ipcMain } from 'electron'
import { memoryDB } from '../db'
import type { MemoryEntry } from '../../shared/types'

export function registerMemoryIPC(): void {
  ipcMain.removeHandler('get-memories')
  ipcMain.handle(
    'get-memories',
    (
      _,
      filters?: {
        hostId?: string
        topicId?: string
        includeDisabled?: boolean
      }
    ) => memoryDB.getMemories(filters)
  )

  ipcMain.removeHandler('create-memory')
  ipcMain.handle(
    'create-memory',
    (
      _,
      memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> &
        Partial<Pick<MemoryEntry, 'scope'>>
    ) => memoryDB.createMemory(memory)
  )

  ipcMain.removeHandler('update-memory')
  ipcMain.handle(
    'update-memory',
    (
      _,
      id: string,
      updates: Partial<
        Pick<
          MemoryEntry,
          'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
        >
      >
    ) => memoryDB.updateMemory(id, updates)
  )

  ipcMain.removeHandler('delete-memory')
  ipcMain.handle('delete-memory', (_, id: string) => memoryDB.deleteMemory(id))
}
