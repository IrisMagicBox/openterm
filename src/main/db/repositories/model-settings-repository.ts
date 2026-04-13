import Database from 'better-sqlite3'
import { ModelSettings } from '../../../shared/types'
import { ModelSettingsRow } from '../row-types'
import { DEFAULT_MODEL, DEFAULT_BASE_URL } from '../../../shared/constants'
import { BaseRepository } from '../base-repository'

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  id: 'default',
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  updatedAt: Date.now()
}

export class ModelSettingsRepository extends BaseRepository<ModelSettingsRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getSettings(): ModelSettings {
    const row = this.stmt('SELECT * FROM model_settings WHERE id = ?').get('default') as
      | ModelSettingsRow
      | undefined
    if (!row) {
      this.saveSettings(DEFAULT_MODEL_SETTINGS)
      return DEFAULT_MODEL_SETTINGS
    }
    return {
      id: row.id,
      apiKey: row.apiKey,
      baseURL: row.baseURL,
      model: row.model,
      updatedAt: row.updatedAt
    }
  }

  saveSettings(settings: Partial<ModelSettings>): void {
    const existing = this.stmt('SELECT * FROM model_settings WHERE id = ?').get('default') as
      | ModelSettingsRow
      | undefined
    const now = Date.now()

    if (existing) {
      this.stmt(
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
      this.stmt(
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
