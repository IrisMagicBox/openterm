import Database from 'better-sqlite3'
import { app, type App } from 'electron'
import os from 'node:os'
import path from 'path'
import { runMigrations } from './migrations'
import { recoverInterruptedAgentRuns } from './recovery'

let dbInstance: Database.Database | null = null

export function getDatabase(dbPath?: string): Database.Database {
  if (!dbInstance) {
    const resolvedPath = dbPath || resolveDefaultDatabasePath()
    dbInstance = new Database(resolvedPath)
    dbInstance.pragma('foreign_keys = ON')
  }
  return dbInstance
}

function resolveDefaultDatabasePath(): string {
  if (process.env.OPENTERM_DB) return expandHome(process.env.OPENTERM_DB)

  const electronApp = app as App | undefined
  if (electronApp?.getPath) {
    return path.join(electronApp.getPath('userData'), 'openterm.db')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'openterm', 'openterm.db')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'openterm', 'openterm.db')
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    'openterm',
    'openterm.db'
  )
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

export function initializeSchema(db: Database.Database): void {
  runMigrations(db)
  if (process.env.OPENTERM_SKIP_RECOVERY !== '1') {
    recoverInterruptedAgentRuns(db)
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
