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
      runId TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thought TEXT,
      toolCalls TEXT,
      toolCallId TEXT,
      name TEXT,
      metadata TEXT,
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

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      topicId TEXT NOT NULL,
      taskId TEXT NOT NULL,
      parentRunId TEXT,
      parentPartId TEXT,
      agentName TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      goal TEXT NOT NULL,
      providerId TEXT,
      modelId TEXT,
      usage TEXT,
      error TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      completedAt INTEGER,
      FOREIGN KEY (topicId) REFERENCES topics(id) ON DELETE CASCADE,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (parentRunId) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_parts (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      messageId TEXT,
      parentPartId TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      role TEXT,
      toolName TEXT,
      toolCallId TEXT,
      hostId TEXT,
      sessionId TEXT,
      input TEXT,
      output TEXT,
      error TEXT,
      metadata TEXT,
      orderIndex INTEGER NOT NULL,
      startedAt INTEGER,
      endedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (runId) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (parentPartId) REFERENCES agent_parts(id) ON DELETE CASCADE,
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_topic ON agent_runs(topicId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(taskId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parentRunId);
    CREATE INDEX IF NOT EXISTS idx_agent_parts_run ON agent_parts(runId, orderIndex);
    CREATE INDEX IF NOT EXISTS idx_agent_parts_parent ON agent_parts(parentPartId);
    CREATE INDEX IF NOT EXISTS idx_agent_parts_tool_call ON agent_parts(toolCallId);

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
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE CASCADE
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
      FOREIGN KEY (hostId) REFERENCES hosts(id) ON DELETE CASCADE,
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
  if (!columns.includes('runId')) {
    db.exec('ALTER TABLE messages ADD COLUMN runId TEXT')
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
  if (!columns.includes('metadata')) {
    db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT')
  }

  db.prepare(
    `
    UPDATE agent_runs
    SET status = 'cancelled',
        error = COALESCE(error, 'Run was interrupted before shutdown completed.'),
        completedAt = COALESCE(completedAt, ?),
        updatedAt = ?
    WHERE status IN ('idle', 'running', 'waiting_approval', 'retrying', 'compacting')
  `
  ).run(Date.now(), Date.now())

  db.prepare(
    `
    UPDATE agent_parts
    SET status = 'cancelled',
        error = COALESCE(error, 'Part was interrupted before shutdown completed.'),
        endedAt = COALESCE(endedAt, ?),
        updatedAt = ?
    WHERE status IN ('pending', 'running', 'blocked')
  `
  ).run(Date.now(), Date.now())

  const sessionInfo = db.prepare('PRAGMA table_info(terminal_sessions)').all() as any[]
  const sessionColumns = sessionInfo.map((c) => c.name)
  if (!sessionColumns.includes('name')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN name TEXT')
  }
  if (!sessionColumns.includes('agentNotes')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN agentNotes TEXT')
  }

  // Add agentNotes to hosts table if not exists
  const hostInfo = db.prepare('PRAGMA table_info(hosts)').all() as any[]
  const hostColumns = hostInfo.map((c) => c.name)
  if (!hostColumns.includes('agentNotes')) {
    db.exec('ALTER TABLE hosts ADD COLUMN agentNotes TEXT')
  }

  // Add soft delete fields to terminal_sessions table
  const sessionInfo2 = db.prepare('PRAGMA table_info(terminal_sessions)').all() as any[]
  const sessionColumns2 = sessionInfo2.map((c) => c.name)
  if (!sessionColumns2.includes('isDeleted')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN isDeleted INTEGER DEFAULT 0')
  }
  if (!sessionColumns2.includes('deletedAt')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN deletedAt INTEGER')
  }
  if (!sessionColumns2.includes('deletedBy')) {
    db.exec('ALTER TABLE terminal_sessions ADD COLUMN deletedBy TEXT')
  }

  // Add soft delete fields to terminal_io table
  const ioInfo = db.prepare('PRAGMA table_info(terminal_io)').all() as any[]
  const ioColumns = ioInfo.map((c) => c.name)
  if (!ioColumns.includes('isDeleted')) {
    db.exec('ALTER TABLE terminal_io ADD COLUMN isDeleted INTEGER DEFAULT 0')
  }
  if (!ioColumns.includes('deletedAt')) {
    db.exec('ALTER TABLE terminal_io ADD COLUMN deletedAt INTEGER')
  }
  if (!ioColumns.includes('deletedBy')) {
    db.exec('ALTER TABLE terminal_io ADD COLUMN deletedBy TEXT')
  }

  const topicInfo = db.prepare('PRAGMA table_info(topics)').all() as any[]
  const topicColumns = topicInfo.map((c) => c.name)
  if (!topicColumns.includes('selectedProviderId')) {
    db.exec('ALTER TABLE topics ADD COLUMN selectedProviderId TEXT')
  }
  if (!topicColumns.includes('selectedModelId')) {
    db.exec('ALTER TABLE topics ADD COLUMN selectedModelId TEXT')
  }

  // Ensure 'local' host exists for foreign key constraints
  const localHost = db.prepare('SELECT id FROM hosts WHERE id = ?').get('local')
  if (!localHost) {
    db.prepare(
      `INSERT INTO hosts (id, alias, ip, port, username, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('local', '本机', 'localhost', 0, '', Date.now())
  }

  // Cleanup redundant coreshub providers if duplicates exist
  db.prepare(
    "DELETE FROM providers WHERE id = 'coreshub' AND isSystem = 1 AND name = 'coreshub'"
  ).run()
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
