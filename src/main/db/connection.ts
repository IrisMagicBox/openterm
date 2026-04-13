import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT,
      keyPath TEXT,
      tags TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      hostIds TEXT NOT NULL,
      lastMessageAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      topicId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS model_settings (
      id TEXT PRIMARY KEY,
      apiKey TEXT NOT NULL,
      baseURL TEXT NOT NULL,
      model TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      apiKey TEXT,
      apiHost TEXT,
      apiVersion TEXT,
      enabled INTEGER DEFAULT 1,
      isSystem INTEGER DEFAULT 0,
      config TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      providerId TEXT NOT NULL,
      name TEXT NOT NULL,
      group_name TEXT,
      capabilities TEXT,
      endpointType TEXT,
      pricing TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (providerId) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      requireConfirmation INTEGER DEFAULT 1,
      autoExecuteSafeOperations INTEGER DEFAULT 1,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      topicId TEXT NOT NULL,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      selectedProviderId TEXT,
      selectedModelId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_steps (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      hostId TEXT,
      title TEXT,
      content TEXT NOT NULL,
      rawOutput TEXT,
      metadata TEXT,
      startedAt INTEGER,
      endedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      stepId TEXT,
      command TEXT NOT NULL,
      riskLevel TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      respondedAt INTEGER,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (stepId) REFERENCES task_steps(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS terminal_sessions (
      id TEXT PRIMARY KEY,
      topicId TEXT NOT NULL,
      hostId TEXT NOT NULL,
      hostAlias TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      shellType TEXT,
      shellIntegrationReady INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      closedAt INTEGER,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS terminal_io (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      topicId TEXT NOT NULL,
      hostId TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'agent',
      content TEXT NOT NULL,
      exitCode INTEGER,
      durationMs INTEGER,
      relatedInputId TEXT,
      isStreaming INTEGER DEFAULT 0,
      chunkIndex INTEGER DEFAULT 0,
      isTruncated INTEGER DEFAULT 0,
      cwd TEXT,
      taskId TEXT,
      stepId TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (sessionId) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (stepId) REFERENCES task_steps(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      hostId TEXT,
      topicId TEXT,
      importance INTEGER DEFAULT 3,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS command_patterns (
      id TEXT PRIMARY KEY,
      hostId TEXT NOT NULL,
      commandPattern TEXT NOT NULL,
      approvalCount INTEGER DEFAULT 0,
      rejectionCount INTEGER DEFAULT 0,
      trustLevel TEXT DEFAULT 'untrusted',
      lastSeen INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `)

  const tableInfo = db.prepare('PRAGMA table_info(messages)').all() as any[]
  const columns = tableInfo.map((c) => c.name)

  if (!columns.includes('thought')) {
    db.exec('ALTER TABLE messages ADD COLUMN thought TEXT')
  }
  if (!columns.includes('toolCalls')) {
    db.exec('ALTER TABLE messages ADD COLUMN toolCalls TEXT')
  }
  if (!columns.includes('toolCallId')) {
    db.exec('ALTER TABLE messages ADD COLUMN toolCallId TEXT')
  }
  if (!columns.includes('name')) {
    db.exec('ALTER TABLE messages ADD COLUMN name TEXT')
  }

  const sessionInfo = db.prepare('PRAGMA table_info(terminal_sessions)').all() as any[]
  const sessionColumns = sessionInfo.map((c) => c.name)
  if (!sessionColumns.includes('name')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN name TEXT')
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
