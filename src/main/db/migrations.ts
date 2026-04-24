import type Database from 'better-sqlite3'
import { SYSTEM_MODELS, SYSTEM_PROVIDERS, getModelApiId } from '../../shared/provider-presets'
import { BASE_SCHEMA_SQL } from './schema'

type Migration = {
  id: string
  run: (db: Database.Database) => void
}

function tableColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (!tableColumns(db, tableName).includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

const migrations: Migration[] = [
  {
    id: '000_base_schema',
    run: (db) => {
      db.exec(BASE_SCHEMA_SQL)
    }
  },
  {
    id: '001_compat_columns',
    run: (db) => {
      addColumnIfMissing(db, 'messages', 'thought', 'TEXT')
      addColumnIfMissing(db, 'messages', 'runId', 'TEXT')
      addColumnIfMissing(db, 'messages', 'toolCalls', 'TEXT')
      addColumnIfMissing(db, 'messages', 'toolCallId', 'TEXT')
      addColumnIfMissing(db, 'messages', 'name', 'TEXT')
      addColumnIfMissing(db, 'messages', 'metadata', 'TEXT')

      addColumnIfMissing(db, 'terminal_sessions', 'name', 'TEXT')
      addColumnIfMissing(db, 'terminal_sessions', 'role', "TEXT DEFAULT 'user'")
      addColumnIfMissing(db, 'terminal_sessions', 'agentNotes', 'TEXT')
      addColumnIfMissing(db, 'terminal_sessions', 'isDeleted', 'INTEGER DEFAULT 0')
      addColumnIfMissing(db, 'terminal_sessions', 'deletedAt', 'INTEGER')
      addColumnIfMissing(db, 'terminal_sessions', 'deletedBy', 'TEXT')

      addColumnIfMissing(db, 'terminal_io', 'isDeleted', 'INTEGER DEFAULT 0')
      addColumnIfMissing(db, 'terminal_io', 'deletedAt', 'INTEGER')
      addColumnIfMissing(db, 'terminal_io', 'deletedBy', 'TEXT')

      addColumnIfMissing(db, 'hosts', 'agentNotes', 'TEXT')
      addColumnIfMissing(db, 'topics', 'selectedProviderId', 'TEXT')
      addColumnIfMissing(db, 'topics', 'selectedModelId', 'TEXT')

      addColumnIfMissing(db, 'approvals', 'riskCategory', 'TEXT')
      addColumnIfMissing(db, 'approvals', 'commandPattern', 'TEXT')
      addColumnIfMissing(db, 'approvals', 'requiresVerification', 'INTEGER DEFAULT 0')

      addColumnIfMissing(db, 'memories', 'scope', "TEXT DEFAULT 'global'")
      addColumnIfMissing(db, 'memories', 'sourceTaskId', 'TEXT')
      addColumnIfMissing(db, 'memories', 'confidence', 'REAL DEFAULT 0.7')
      addColumnIfMissing(db, 'memories', 'lastUsedAt', 'INTEGER')
      addColumnIfMissing(db, 'memories', 'disabled', 'INTEGER DEFAULT 0')
    }
  },
  {
    id: '002_seed_local_host',
    run: (db) => {
      const localHost = db.prepare('SELECT id FROM hosts WHERE id = ?').get('local')
      if (!localHost) {
        db.prepare(
          `INSERT INTO hosts (id, alias, ip, port, username, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('local', '本机', 'localhost', 0, '', Date.now())
      }
    }
  },
  {
    id: '003_cleanup_system_provider_duplicates',
    run: (db) => {
      db.prepare(
        "DELETE FROM providers WHERE id = 'coreshub' AND isSystem = 1 AND name = 'coreshub'"
      ).run()
    }
  },
  {
    id: '004_provider_model_presets',
    run: (db) => {
      addColumnIfMissing(db, 'models', 'providerModelId', 'TEXT')
      db.prepare('UPDATE models SET providerModelId = id WHERE providerModelId IS NULL').run()

      const insertProvider = db.prepare(`
        INSERT OR IGNORE INTO providers
          (id, name, type, apiKey, apiHost, apiVersion, enabled, isSystem, config, createdAt, updatedAt)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertModel = db.prepare(`
        INSERT OR IGNORE INTO models
          (id, providerId, providerModelId, name, group_name, capabilities, endpointType, pricing, createdAt)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const provider of SYSTEM_PROVIDERS) {
        insertProvider.run(
          provider.id,
          provider.name,
          provider.type,
          provider.apiKey,
          provider.apiHost,
          provider.apiVersion,
          provider.enabled ? 1 : 0,
          provider.isSystem ? 1 : 0,
          provider.config ? JSON.stringify(provider.config) : null,
          provider.createdAt || Date.now(),
          provider.updatedAt || Date.now()
        )
      }

      for (const model of SYSTEM_MODELS) {
        insertModel.run(
          model.id,
          model.providerId,
          model.providerModelId ?? getModelApiId(model),
          model.name,
          model.group,
          model.capabilities ? JSON.stringify(model.capabilities) : null,
          model.endpointType,
          model.pricing ? JSON.stringify(model.pricing) : null,
          model.createdAt || Date.now()
        )
      }
    }
  },
  {
    id: '005_memory_taxonomy',
    run: (db) => {
      addColumnIfMissing(db, 'memories', 'scope', "TEXT DEFAULT 'global'")
      addColumnIfMissing(db, 'memories', 'sourceTaskId', 'TEXT')
      addColumnIfMissing(db, 'memories', 'confidence', 'REAL DEFAULT 0.7')
      addColumnIfMissing(db, 'memories', 'lastUsedAt', 'INTEGER')
      addColumnIfMissing(db, 'memories', 'disabled', 'INTEGER DEFAULT 0')

      db.prepare("UPDATE memories SET type = 'user_preference' WHERE type = 'habit'").run()
      db.prepare("UPDATE memories SET type = 'task_experience' WHERE type = 'experience'").run()
      db.prepare(
        "UPDATE memories SET scope = CASE WHEN hostId IS NOT NULL THEN 'host' WHEN topicId IS NOT NULL THEN 'topic' ELSE 'global' END WHERE scope IS NULL OR scope = ''"
      ).run()
      db.prepare('UPDATE memories SET confidence = 0.7 WHERE confidence IS NULL').run()
      db.prepare('UPDATE memories SET disabled = 0 WHERE disabled IS NULL').run()
    }
  },
  {
    id: '006_policy_metadata',
    run: (db) => {
      addColumnIfMissing(db, 'approvals', 'riskCategory', 'TEXT')
      addColumnIfMissing(db, 'approvals', 'commandPattern', 'TEXT')
      addColumnIfMissing(db, 'approvals', 'requiresVerification', 'INTEGER DEFAULT 0')
    }
  },
  {
    id: '007_terminal_session_role',
    run: (db) => {
      addColumnIfMissing(db, 'terminal_sessions', 'role', "TEXT DEFAULT 'user'")
      db.prepare("UPDATE terminal_sessions SET role = 'user' WHERE role IS NULL OR role = ''").run()
    }
  },
  {
    id: '008_global_memory_profile',
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS global_memory (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `)
    }
  },
  {
    id: '009_agent_run_metadata',
    run: (db) => {
      addColumnIfMissing(db, 'agent_runs', 'metadata', 'TEXT')
    }
  }
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt INTEGER NOT NULL
    );
  `)

  const hasMigration = db.prepare('SELECT id FROM schema_migrations WHERE id = ?')
  const insertMigration = db.prepare('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)')

  const migrate = db.transaction(() => {
    for (const migration of migrations) {
      if (hasMigration.get(migration.id)) continue
      migration.run(db)
      insertMigration.run(migration.id, Date.now())
    }
  })

  migrate()
}
