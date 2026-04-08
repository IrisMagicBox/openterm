import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { Host, Topic, Message, ModelSettings, Provider, Model } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'

const dbPath = path.join(app.getPath('userData'), 'openterm.db')
const db = new Database(dbPath)

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

export const hostDB = {
  getHosts: (): Host[] => {
    const rows = db.prepare('SELECT * FROM hosts ORDER BY createdAt DESC').all() as any[]
    return rows.map((row) => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
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
      tags: JSON.parse(row.tags || '[]')
    }
  }
}

export const topicDB = {
  getTopics: (): Topic[] => {
    const rows = db.prepare('SELECT * FROM topics ORDER BY lastMessageAt DESC').all() as any[]
    return rows.map((row) => ({
      ...row,
      hostIds: JSON.parse(row.hostIds || '[]')
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

  updateTopicHosts: (id: string, hostIds: string[]) => {
    const hostsStr = JSON.stringify(hostIds)
    db.prepare('UPDATE topics SET hostIds = ? WHERE id = ?').run(hostsStr, id)
  },

  getTopicById: (id: string): Topic | undefined => {
    const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      ...row,
      hostIds: JSON.parse(row.hostIds || '[]')
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
      toolCalls: JSON.parse(row.toolCalls || 'null')
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
