import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import {
  Host,
  Topic,
  Message,
  ModelSettings,
  Provider,
  Model,
  PermissionSettings,
  Task,
  TaskStep,
  Approval,
  Artifact,
  TerminalSession,
  TerminalSessionStatus,
  TerminalIO
} from '../shared/types'
import { v4 as uuidv4 } from 'uuid'

const dbPath = path.join(app.getPath('userData'), 'openterm.db')
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

export const initializeDB = () => {
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
}

const parseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const mapTaskRow = (row: any): Task => ({
  id: row.id,
  topicId: row.topicId,
  title: row.title,
  goal: row.goal,
  status: row.status,
  summary: row.summary || undefined,
  selectedProviderId: row.selectedProviderId || undefined,
  selectedModelId: row.selectedModelId || undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

const mapTaskStepRow = (row: any): TaskStep => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type,
  status: row.status,
  hostId: row.hostId || undefined,
  title: row.title || undefined,
  content: row.content,
  rawOutput: row.rawOutput || undefined,
  metadata: parseJSON<Record<string, unknown> | undefined>(row.metadata, undefined),
  startedAt: row.startedAt || undefined,
  endedAt: row.endedAt || undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

const mapApprovalRow = (row: any): Approval => ({
  id: row.id,
  taskId: row.taskId,
  stepId: row.stepId || undefined,
  command: row.command,
  riskLevel: row.riskLevel,
  reason: row.reason || undefined,
  status: row.status,
  createdAt: row.createdAt,
  respondedAt: row.respondedAt || undefined
})

const mapArtifactRow = (row: any): Artifact => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type,
  title: row.title,
  content: row.content,
  metadata: parseJSON<Record<string, unknown> | undefined>(row.metadata, undefined),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

export const hostDB = {
  getHosts: (): Host[] => {
    const rows = db.prepare('SELECT * FROM hosts ORDER BY createdAt DESC').all() as any[]
    return rows.map((row) => ({
      ...row,
      tags: parseJSON(row.tags, [])
    }))
  },

  createHost: (host: Omit<Host, 'id' | 'createdAt'>): Host => {
    const id = uuidv4()
    const createdAt = Date.now()
    const tagsStr = JSON.stringify(host.tags)

    db.prepare(
      `
      INSERT INTO hosts (id, alias, ip, port, username, password, keyPath, tags, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      host.alias,
      host.ip,
      host.port,
      host.username,
      host.password,
      host.keyPath,
      tagsStr,
      createdAt
    )

    return { ...host, id, createdAt }
  },

  deleteHost: (id: string) => {
    db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
  },

  getHostById: (id: string): Host | undefined => {
    const row = db.prepare('SELECT * FROM hosts WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      ...row,
      tags: parseJSON(row.tags, [])
    }
  }
}

export const topicDB = {
  getTopics: (): Topic[] => {
    const rows = db.prepare('SELECT * FROM topics ORDER BY lastMessageAt DESC').all() as any[]
    return rows.map((row) => ({
      ...row,
      hostIds: parseJSON(row.hostIds, [])
    }))
  },

  createTopic: (title: string, hostIds: string[]): Topic => {
    const id = uuidv4()
    const now = Date.now()
    const hostsStr = JSON.stringify(hostIds)

    db.prepare(
      `
      INSERT INTO topics (id, title, hostIds, lastMessageAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(id, title, hostsStr, now, now)

    return { id, title, hostIds, lastMessageAt: now, createdAt: now }
  },

  updateTopicTitle: (id: string, title: string) => {
    db.prepare('UPDATE topics SET title = ? WHERE id = ?').run(title, id)
  },

  deleteTopic: (id: string) => {
    db.prepare('DELETE FROM topics WHERE id = ?').run(id)
  },

  updateTopicHosts: (id: string, hostIds: string[]) => {
    const hostsStr = JSON.stringify(hostIds)
    db.prepare('UPDATE topics SET hostIds = ? WHERE id = ?').run(hostsStr, id)
  },

  getTopicById: (id: string): Topic | undefined => {
    const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      ...row,
      hostIds: parseJSON(row.hostIds, [])
    }
  }
}

export const messageDB = {
  getMessages: (topicId: string): Message[] => {
    const rows = db
      .prepare('SELECT * FROM messages WHERE topicId = ? ORDER BY timestamp ASC')
      .all(topicId) as any[]
    return rows.map((row) => ({
      ...row,
      toolCalls: parseJSON(row.toolCalls, null)
    }))
  },

  createMessage: (message: Message) => {
    const toolCallsStr = message.toolCalls ? JSON.stringify(message.toolCalls) : null
    db.prepare(
      `
      INSERT INTO messages (id, topicId, role, content, thought, toolCalls, toolCallId, name, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      message.id,
      message.topicId,
      message.role,
      message.content || '',
      message.thought || null,
      toolCallsStr,
      message.toolCallId || null,
      message.name || null,
      message.timestamp
    )

    db.prepare('UPDATE topics SET lastMessageAt = ? WHERE id = ?').run(
      message.timestamp,
      message.topicId
    )
  }
}

export const taskDB = {
  getTasks: (topicId?: string): Task[] => {
    const query = topicId
      ? 'SELECT * FROM tasks WHERE topicId = ? ORDER BY updatedAt DESC'
      : 'SELECT * FROM tasks ORDER BY updatedAt DESC'
    const rows = db.prepare(query).all(topicId ? topicId : undefined) as any[]
    return rows.map(mapTaskRow)
  },

  getTaskById: (id: string): Task | undefined => {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any
    return row ? mapTaskRow(row) : undefined
  },

  getLatestTaskByTopicId: (topicId: string): Task | undefined => {
    const row = db
      .prepare('SELECT * FROM tasks WHERE topicId = ? ORDER BY updatedAt DESC LIMIT 1')
      .get(topicId) as any
    return row ? mapTaskRow(row) : undefined
  },

  createTask: (
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ): Task => {
    const id = task.id || uuidv4()
    const now = task.createdAt || Date.now()
    const updatedAt = task.updatedAt || now
    const createdTask: Task = {
      id,
      topicId: task.topicId,
      title: task.title,
      goal: task.goal,
      status: task.status,
      summary: task.summary,
      selectedProviderId: task.selectedProviderId,
      selectedModelId: task.selectedModelId,
      createdAt: now,
      updatedAt
    }

    db.prepare(
      `
      INSERT INTO tasks (id, topicId, title, goal, status, summary, selectedProviderId, selectedModelId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdTask.id,
      createdTask.topicId,
      createdTask.title,
      createdTask.goal,
      createdTask.status,
      createdTask.summary || null,
      createdTask.selectedProviderId || null,
      createdTask.selectedModelId || null,
      createdTask.createdAt,
      createdTask.updatedAt
    )

    return createdTask
  },

  updateTask: (
    id: string,
    updates: Partial<Omit<Task, 'id' | 'topicId' | 'createdAt'>>
  ): Task | undefined => {
    const existing = taskDB.getTaskById(id)
    if (!existing) return undefined

    const updated: Task = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    db.prepare(
      `
      UPDATE tasks
      SET title = ?, goal = ?, status = ?, summary = ?, selectedProviderId = ?, selectedModelId = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.title,
      updated.goal,
      updated.status,
      updated.summary || null,
      updated.selectedProviderId || null,
      updated.selectedModelId || null,
      updated.updatedAt,
      id
    )

    return updated
  }
}

export const taskStepDB = {
  getTaskSteps: (taskId: string): TaskStep[] => {
    const rows = db
      .prepare('SELECT * FROM task_steps WHERE taskId = ? ORDER BY createdAt ASC')
      .all(taskId) as any[]
    return rows.map(mapTaskStepRow)
  },

  createStep: (
    step: Omit<TaskStep, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<TaskStep, 'id' | 'createdAt' | 'updatedAt'>>
  ): TaskStep => {
    const id = step.id || uuidv4()
    const now = step.createdAt || Date.now()
    const updatedAt = step.updatedAt || now
    const createdStep: TaskStep = {
      id,
      taskId: step.taskId,
      type: step.type,
      status: step.status,
      hostId: step.hostId,
      title: step.title,
      content: step.content,
      rawOutput: step.rawOutput,
      metadata: step.metadata,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      createdAt: now,
      updatedAt
    }

    db.prepare(
      `
      INSERT INTO task_steps (id, taskId, type, status, hostId, title, content, rawOutput, metadata, startedAt, endedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdStep.id,
      createdStep.taskId,
      createdStep.type,
      createdStep.status,
      createdStep.hostId || null,
      createdStep.title || null,
      createdStep.content,
      createdStep.rawOutput || null,
      createdStep.metadata ? JSON.stringify(createdStep.metadata) : null,
      createdStep.startedAt || null,
      createdStep.endedAt || null,
      createdStep.createdAt,
      createdStep.updatedAt
    )

    db.prepare('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updatedAt, createdStep.taskId)
    return createdStep
  },

  updateStep: (
    id: string,
    updates: Partial<Omit<TaskStep, 'id' | 'taskId' | 'createdAt'>>
  ): TaskStep | undefined => {
    const row = db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id) as any
    if (!row) return undefined

    const existing = mapTaskStepRow(row)
    const updated: TaskStep = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    db.prepare(
      `
      UPDATE task_steps
      SET type = ?, status = ?, hostId = ?, title = ?, content = ?, rawOutput = ?, metadata = ?, startedAt = ?, endedAt = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      updated.type,
      updated.status,
      updated.hostId || null,
      updated.title || null,
      updated.content,
      updated.rawOutput || null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.startedAt || null,
      updated.endedAt || null,
      updated.updatedAt,
      id
    )

    db.prepare('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updated.updatedAt, updated.taskId)
    return updated
  }
}

export const approvalDB = {
  getApprovalsByTaskId: (taskId: string): Approval[] => {
    const rows = db
      .prepare('SELECT * FROM approvals WHERE taskId = ? ORDER BY createdAt ASC')
      .all(taskId) as any[]
    return rows.map(mapApprovalRow)
  },

  createApproval: (
    approval: Omit<Approval, 'id' | 'createdAt'> & Partial<Pick<Approval, 'id' | 'createdAt'>>
  ): Approval => {
    const id = approval.id || uuidv4()
    const createdAt = approval.createdAt || Date.now()
    const createdApproval: Approval = {
      id,
      taskId: approval.taskId,
      stepId: approval.stepId,
      command: approval.command,
      riskLevel: approval.riskLevel,
      reason: approval.reason,
      status: approval.status,
      createdAt,
      respondedAt: approval.respondedAt
    }

    db.prepare(
      `
      INSERT INTO approvals (id, taskId, stepId, command, riskLevel, reason, status, createdAt, respondedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdApproval.id,
      createdApproval.taskId,
      createdApproval.stepId || null,
      createdApproval.command,
      createdApproval.riskLevel,
      createdApproval.reason || null,
      createdApproval.status,
      createdApproval.createdAt,
      createdApproval.respondedAt || null
    )

    return createdApproval
  },

  updateApprovalStatus: (id: string, status: Approval['status']): Approval | undefined => {
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as any
    if (!row) return undefined

    const respondedAt = Date.now()
    db.prepare('UPDATE approvals SET status = ?, respondedAt = ? WHERE id = ?').run(
      status,
      respondedAt,
      id
    )

    return mapApprovalRow({ ...row, status, respondedAt })
  }
}

export const artifactDB = {
  getArtifactsByTaskId: (taskId: string): Artifact[] => {
    const rows = db
      .prepare('SELECT * FROM artifacts WHERE taskId = ? ORDER BY createdAt ASC')
      .all(taskId) as any[]
    return rows.map(mapArtifactRow)
  },

  createArtifact: (
    artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Artifact, 'id' | 'createdAt' | 'updatedAt'>>
  ): Artifact => {
    const id = artifact.id || uuidv4()
    const now = artifact.createdAt || Date.now()
    const updatedAt = artifact.updatedAt || now
    const createdArtifact: Artifact = {
      id,
      taskId: artifact.taskId,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      metadata: artifact.metadata,
      createdAt: now,
      updatedAt
    }

    db.prepare(
      `
      INSERT INTO artifacts (id, taskId, type, title, content, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      createdArtifact.id,
      createdArtifact.taskId,
      createdArtifact.type,
      createdArtifact.title,
      createdArtifact.content,
      createdArtifact.metadata ? JSON.stringify(createdArtifact.metadata) : null,
      createdArtifact.createdAt,
      createdArtifact.updatedAt
    )

    db.prepare('UPDATE tasks SET updatedAt = ? WHERE id = ?').run(updatedAt, createdArtifact.taskId)
    return createdArtifact
  }
}

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  id: 'default',
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  updatedAt: Date.now()
}

export const modelSettingsDB = {
  getSettings: (): ModelSettings => {
    const row = db.prepare('SELECT * FROM model_settings WHERE id = ?').get('default') as any
    if (!row) {
      modelSettingsDB.saveSettings(DEFAULT_MODEL_SETTINGS)
      return DEFAULT_MODEL_SETTINGS
    }
    return {
      id: row.id,
      apiKey: row.apiKey,
      baseURL: row.baseURL,
      model: row.model,
      updatedAt: row.updatedAt
    }
  },

  saveSettings: (settings: Partial<ModelSettings>) => {
    const existing = db.prepare('SELECT * FROM model_settings WHERE id = ?').get('default') as any
    const now = Date.now()

    if (existing) {
      db.prepare(
        `
        UPDATE model_settings
        SET apiKey = COALESCE(?, apiKey),
            baseURL = COALESCE(?, baseURL),
            model = COALESCE(?, model),
            updatedAt = ?
        WHERE id = ?
      `
      ).run(
        settings.apiKey ?? null,
        settings.baseURL ?? null,
        settings.model ?? null,
        now,
        'default'
      )
    } else {
      db.prepare(
        `
        INSERT INTO model_settings (id, apiKey, baseURL, model, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        'default',
        settings.apiKey || DEFAULT_MODEL_SETTINGS.apiKey,
        settings.baseURL || DEFAULT_MODEL_SETTINGS.baseURL,
        settings.model || DEFAULT_MODEL_SETTINGS.model,
        now
      )
    }
  }
}

const DEFAULT_PERMISSIONS: PermissionSettings = {
  requireConfirmation: true,
  autoExecuteSafeOperations: true,
  updatedAt: Date.now()
}

export const permissionDB = {
  getPermissions: (): PermissionSettings => {
    const row = db.prepare('SELECT * FROM permissions WHERE id = ?').get('default') as any
    if (!row) {
      permissionDB.savePermissions(DEFAULT_PERMISSIONS)
      return DEFAULT_PERMISSIONS
    }
    return {
      requireConfirmation: row.requireConfirmation === 1,
      autoExecuteSafeOperations: row.autoExecuteSafeOperations === 1,
      updatedAt: row.updatedAt
    }
  },

  savePermissions: (permissions: Partial<PermissionSettings>) => {
    const existing = db.prepare('SELECT * FROM permissions WHERE id = ?').get('default') as any
    const now = Date.now()

    if (existing) {
      db.prepare(
        `
        UPDATE permissions
        SET requireConfirmation = COALESCE(?, requireConfirmation),
            autoExecuteSafeOperations = COALESCE(?, autoExecuteSafeOperations),
            updatedAt = ?
        WHERE id = ?
      `
      ).run(
        permissions.requireConfirmation !== undefined
          ? permissions.requireConfirmation
            ? 1
            : 0
          : null,
        permissions.autoExecuteSafeOperations !== undefined
          ? permissions.autoExecuteSafeOperations
            ? 1
            : 0
          : null,
        now,
        'default'
      )
    } else {
      db.prepare(
        `
        INSERT INTO permissions (id, requireConfirmation, autoExecuteSafeOperations, updatedAt)
        VALUES (?, ?, ?, ?)
      `
      ).run(
        'default',
        permissions.requireConfirmation !== undefined
          ? permissions.requireConfirmation
            ? 1
            : 0
          : 1,
        permissions.autoExecuteSafeOperations !== undefined
          ? permissions.autoExecuteSafeOperations
            ? 1
            : 0
          : 1,
        now
      )
    }
  }
}

export const providerDB = {
  getProviders: (): Provider[] => {
    const rows = db.prepare('SELECT * FROM providers ORDER BY createdAt DESC').all() as any[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      apiKey: row.apiKey || '',
      apiHost: row.apiHost || '',
      apiVersion: row.apiVersion,
      enabled: row.enabled === 1,
      isSystem: row.isSystem === 1,
      config: row.config ? JSON.parse(row.config) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  },

  getProviderById: (id: string): Provider | undefined => {
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      apiKey: row.apiKey || '',
      apiHost: row.apiHost || '',
      apiVersion: row.apiVersion,
      enabled: row.enabled === 1,
      isSystem: row.isSystem === 1,
      config: row.config ? JSON.parse(row.config) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  },

  saveProvider: (provider: Provider): void => {
    const now = Date.now()
    const existing = db.prepare('SELECT * FROM providers WHERE id = ?').get(provider.id) as any
    const configStr = provider.config ? JSON.stringify(provider.config) : null

    if (existing) {
      db.prepare(
        `
        UPDATE providers
        SET name = ?, type = ?, apiKey = ?, apiHost = ?, apiVersion = ?,
            enabled = ?, isSystem = ?, config = ?, updatedAt = ?
        WHERE id = ?
      `
      ).run(
        provider.name,
        provider.type,
        provider.apiKey,
        provider.apiHost,
        provider.apiVersion,
        provider.enabled ? 1 : 0,
        provider.isSystem ? 1 : 0,
        configStr,
        now,
        provider.id
      )
    } else {
      db.prepare(
        `
        INSERT INTO providers (id, name, type, apiKey, apiHost, apiVersion, enabled, isSystem, config, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        provider.id,
        provider.name,
        provider.type,
        provider.apiKey,
        provider.apiHost,
        provider.apiVersion,
        provider.enabled ? 1 : 0,
        provider.isSystem ? 1 : 0,
        configStr,
        provider.createdAt || now,
        now
      )
    }
  },

  deleteProvider: (id: string): void => {
    db.prepare('DELETE FROM providers WHERE id = ?').run(id)
  }
}

export const modelDB = {
  getModels: (providerId?: string): Model[] => {
    const query = providerId
      ? 'SELECT * FROM models WHERE providerId = ? ORDER BY createdAt DESC'
      : 'SELECT * FROM models ORDER BY createdAt DESC'
    const rows = db.prepare(query).all(providerId ? [providerId] : []) as any[]
    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      name: row.name,
      group: row.group_name,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
      endpointType: row.endpointType,
      pricing: row.pricing ? JSON.parse(row.pricing) : undefined,
      createdAt: row.createdAt
    }))
  },

  getModelById: (id: string): Model | undefined => {
    const row = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      providerId: row.providerId,
      name: row.name,
      group: row.group_name,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
      endpointType: row.endpointType,
      pricing: row.pricing ? JSON.parse(row.pricing) : undefined,
      createdAt: row.createdAt
    }
  },

  saveModel: (model: Model): void => {
    const now = Date.now()
    const existing = db.prepare('SELECT * FROM models WHERE id = ?').get(model.id) as any
    const capabilitiesStr = model.capabilities ? JSON.stringify(model.capabilities) : null
    const pricingStr = model.pricing ? JSON.stringify(model.pricing) : null

    if (existing) {
      db.prepare(
        `
        UPDATE models
        SET providerId = ?, name = ?, group_name = ?, capabilities = ?, endpointType = ?, pricing = ?
        WHERE id = ?
      `
      ).run(
        model.providerId,
        model.name,
        model.group,
        capabilitiesStr,
        model.endpointType,
        pricingStr,
        model.id
      )
    } else {
      db.prepare(
        `
        INSERT INTO models (id, providerId, name, group_name, capabilities, endpointType, pricing, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        model.id,
        model.providerId,
        model.name,
        model.group,
        capabilitiesStr,
        model.endpointType,
        pricingStr,
        model.createdAt || now
      )
    }
  },

  deleteModel: (id: string): void => {
    db.prepare('DELETE FROM models WHERE id = ?').run(id)
  },

  deleteModelsByProvider: (providerId: string): void => {
    db.prepare('DELETE FROM models WHERE providerId = ?').run(providerId)
  }
}

export const terminalSessionDB = {
  createSession: (session: TerminalSession): void => {
    db.prepare(
      `INSERT INTO terminal_sessions (id, topicId, hostId, hostAlias, status, shellType, shellIntegrationReady, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.topicId,
      session.hostId,
      session.hostAlias,
      session.status,
      session.shellType || null,
      session.shellIntegrationReady ? 1 : 0,
      session.createdAt
    )
  },

  getSessionById: (id: string): TerminalSession | undefined => {
    const row = db.prepare('SELECT * FROM terminal_sessions WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status,
      shellType: row.shellType,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt || undefined
    }
  },

  getSessionsByTopic: (topicId: string): TerminalSession[] => {
    const rows = db
      .prepare('SELECT * FROM terminal_sessions WHERE topicId = ? ORDER BY createdAt DESC')
      .all(topicId) as any[]
    return rows.map((row) => ({
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status,
      shellType: row.shellType,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt || undefined
    }))
  },

  getSessionsByHost: (hostId: string): TerminalSession[] => {
    const rows = db
      .prepare('SELECT * FROM terminal_sessions WHERE hostId = ? ORDER BY createdAt DESC')
      .all(hostId) as any[]
    return rows.map((row) => ({
      id: row.id,
      topicId: row.topicId,
      hostId: row.hostId,
      hostAlias: row.hostAlias,
      status: row.status,
      shellType: row.shellType,
      shellIntegrationReady: row.shellIntegrationReady === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt || undefined
    }))
  },

  updateSessionStatus: (id: string, status: TerminalSessionStatus): void => {
    db.prepare('UPDATE terminal_sessions SET status = ? WHERE id = ?').run(status, id)
  },

  updateSessionShellIntegration: (id: string, ready: boolean): void => {
    db.prepare('UPDATE terminal_sessions SET shellIntegrationReady = ? WHERE id = ?').run(
      ready ? 1 : 0,
      id
    )
  },

  closeSession: (id: string): void => {
    db.prepare('UPDATE terminal_sessions SET status = ?, closedAt = ? WHERE id = ?').run(
      'closed',
      Date.now(),
      id
    )
  },

  deleteSession: (id: string): void => {
    db.prepare('DELETE FROM terminal_sessions WHERE id = ?').run(id)
  }
}

export const terminalIODB = {
  createIO: (io: TerminalIO): void => {
    db.prepare(
      `INSERT INTO terminal_io (id, sessionId, topicId, hostId, type, source, content, exitCode, durationMs, relatedInputId, isStreaming, chunkIndex, isTruncated, cwd, taskId, stepId, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      io.id,
      io.sessionId,
      io.topicId,
      io.hostId,
      io.type,
      io.source,
      io.content,
      io.exitCode || null,
      io.durationMs || null,
      io.relatedInputId || null,
      io.isStreaming ? 1 : 0,
      io.chunkIndex || 0,
      io.isTruncated ? 1 : 0,
      io.cwd || null,
      io.taskId || null,
      io.stepId || null,
      io.timestamp
    )
  },

  getIOById: (id: string): TerminalIO | undefined => {
    const row = db.prepare('SELECT * FROM terminal_io WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      sessionId: row.sessionId,
      topicId: row.topicId,
      hostId: row.hostId,
      type: row.type,
      source: row.source,
      content: row.content,
      exitCode: row.exitCode || undefined,
      durationMs: row.durationMs || undefined,
      relatedInputId: row.relatedInputId || undefined,
      isStreaming: row.isStreaming === 1,
      chunkIndex: row.chunkIndex,
      isTruncated: row.isTruncated === 1,
      cwd: row.cwd || undefined,
      taskId: row.taskId || undefined,
      stepId: row.stepId || undefined,
      timestamp: row.timestamp
    }
  },

  getIOBySession: (sessionId: string, limit = 100): TerminalIO[] => {
    const rows = db
      .prepare('SELECT * FROM terminal_io WHERE sessionId = ? ORDER BY timestamp DESC LIMIT ?')
      .all(sessionId, limit) as any[]
    return rows
      .map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        topicId: row.topicId,
        hostId: row.hostId,
        type: row.type,
        source: row.source,
        content: row.content,
        exitCode: row.exitCode || undefined,
        durationMs: row.durationMs || undefined,
        relatedInputId: row.relatedInputId || undefined,
        isStreaming: row.isStreaming === 1,
        chunkIndex: row.chunkIndex,
        isTruncated: row.isTruncated === 1,
        cwd: row.cwd || undefined,
        taskId: row.taskId || undefined,
        stepId: row.stepId || undefined,
        timestamp: row.timestamp
      }))
      .reverse()
  },

  getIOByTopic: (topicId: string, limit = 200): TerminalIO[] => {
    const rows = db
      .prepare('SELECT * FROM terminal_io WHERE topicId = ? ORDER BY timestamp DESC LIMIT ?')
      .all(topicId, limit) as any[]
    return rows
      .map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        topicId: row.topicId,
        hostId: row.hostId,
        type: row.type,
        source: row.source,
        content: row.content,
        exitCode: row.exitCode || undefined,
        durationMs: row.durationMs || undefined,
        relatedInputId: row.relatedInputId || undefined,
        isStreaming: row.isStreaming === 1,
        chunkIndex: row.chunkIndex,
        isTruncated: row.isTruncated === 1,
        cwd: row.cwd || undefined,
        taskId: row.taskId || undefined,
        stepId: row.stepId || undefined,
        timestamp: row.timestamp
      }))
      .reverse()
  },

  getRecentInputsBySession: (sessionId: string, limit = 20): TerminalIO[] => {
    const rows = db
      .prepare(
        'SELECT * FROM terminal_io WHERE sessionId = ? AND type = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .all(sessionId, 'input', limit) as any[]
    return rows
      .map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        topicId: row.topicId,
        hostId: row.hostId,
        type: row.type,
        source: row.source,
        content: row.content,
        exitCode: row.exitCode || undefined,
        durationMs: row.durationMs || undefined,
        relatedInputId: row.relatedInputId || undefined,
        isStreaming: row.isStreaming === 1,
        chunkIndex: row.chunkIndex,
        isTruncated: row.isTruncated === 1,
        cwd: row.cwd || undefined,
        taskId: row.taskId || undefined,
        stepId: row.stepId || undefined,
        timestamp: row.timestamp
      }))
      .reverse()
  },

  getOutputByRelatedInput: (relatedInputId: string): TerminalIO | undefined => {
    const row = db
      .prepare('SELECT * FROM terminal_io WHERE relatedInputId = ? AND type = ?')
      .get(relatedInputId, 'output') as any
    if (!row) return undefined
    return {
      id: row.id,
      sessionId: row.sessionId,
      topicId: row.topicId,
      hostId: row.hostId,
      type: row.type,
      source: row.source,
      content: row.content,
      exitCode: row.exitCode || undefined,
      durationMs: row.durationMs || undefined,
      relatedInputId: row.relatedInputId || undefined,
      isStreaming: row.isStreaming === 1,
      chunkIndex: row.chunkIndex,
      isTruncated: row.isTruncated === 1,
      cwd: row.cwd || undefined,
      taskId: row.taskId || undefined,
      stepId: row.stepId || undefined,
      timestamp: row.timestamp
    }
  },

  updateOutput: (id: string, updates: Partial<TerminalIO>): void => {
    const sets: string[] = []
    const values: any[] = []
    if (updates.content !== undefined) {
      sets.push('content = ?')
      values.push(updates.content)
    }
    if (updates.exitCode !== undefined) {
      sets.push('exitCode = ?')
      values.push(updates.exitCode)
    }
    if (updates.durationMs !== undefined) {
      sets.push('durationMs = ?')
      values.push(updates.durationMs)
    }
    if (updates.isTruncated !== undefined) {
      sets.push('isTruncated = ?')
      values.push(updates.isTruncated ? 1 : 0)
    }
    if (updates.chunkIndex !== undefined) {
      sets.push('chunkIndex = ?')
      values.push(updates.chunkIndex)
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE terminal_io SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }
  },

  deleteIOBySession: (sessionId: string): void => {
    db.prepare('DELETE FROM terminal_io WHERE sessionId = ?').run(sessionId)
  }
}
