import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { runMigrations } from './migrations'
import { recoverInterruptedAgentRuns } from './recovery'

let dbInstance: Database.Database | null = null

export function getDatabase(dbPath?: string): Database.Database {
  if (!dbInstance) {
    const resolvedPath = dbPath || path.join(app.getPath('userData'), 'openterm.db')
    dbInstance = new Database(resolvedPath)
    dbInstance.pragma('foreign_keys = ON')
  }
  return dbInstance
}

export function initializeSchema(db: Database.Database): void {
  runMigrations(db)
  recoverInterruptedAgentRuns(db)
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
