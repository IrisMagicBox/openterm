import Database from 'better-sqlite3'
import { Provider } from '../../../shared/types'
import { ProviderRow } from '../row-types'
import { mapProviderRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class ProviderRepository extends BaseRepository<ProviderRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getProviders(): Provider[] {
    const rows = this.stmt('SELECT * FROM providers ORDER BY createdAt DESC').all() as ProviderRow[]
    return rows.map(mapProviderRow)
  }

  getProviderById(id: string): Provider | undefined {
    const row = this.stmt('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined
    return row ? mapProviderRow(row) : undefined
  }

  saveProvider(provider: Provider): void {
    const now = Date.now()
    const existing = this.stmt('SELECT * FROM providers WHERE id = ?').get(provider.id) as
      | ProviderRow
      | undefined
    const configStr = provider.config ? JSON.stringify(provider.config) : null

    if (existing) {
      this.stmt(
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
      this.stmt(
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
  }

  deleteProvider(id: string): void {
    this.stmt('DELETE FROM providers WHERE id = ?').run(id)
  }
}
