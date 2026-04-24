import { ipcMain } from 'electron'
import { globalMemoryDB, memoryDB } from '../db'
import type {
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory,
  MemoryEntry
} from '../../shared/types'

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
      memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> & Partial<Pick<MemoryEntry, 'scope'>>
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

  ipcMain.removeHandler('get-global-memory')
  ipcMain.handle('get-global-memory', () => globalMemoryDB.getMemory())

  ipcMain.removeHandler('import-global-memory')
  ipcMain.handle('import-global-memory', (_, memory: GlobalMemoryData) =>
    globalMemoryDB.importMemory(memory)
  )

  ipcMain.removeHandler('clear-global-memory')
  ipcMain.handle('clear-global-memory', () => globalMemoryDB.clearMemory())

  ipcMain.removeHandler('create-global-memory-fact')
  ipcMain.handle(
    'create-global-memory-fact',
    (
      _,
      fact: {
        content: string
        category?: GlobalMemoryFactCategory | string
        confidence?: number
        source?: string
        sourceError?: string
      }
    ) => globalMemoryDB.createFact(fact)
  )

  ipcMain.removeHandler('update-global-memory-fact')
  ipcMain.handle(
    'update-global-memory-fact',
    (
      _,
      factId: string,
      updates: Partial<
        Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>
      >
    ) => globalMemoryDB.updateFact(factId, updates)
  )

  ipcMain.removeHandler('delete-global-memory-fact')
  ipcMain.handle('delete-global-memory-fact', (_, factId: string) =>
    globalMemoryDB.deleteFact(factId)
  )
}
