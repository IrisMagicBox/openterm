import Database from 'better-sqlite3'
import { ModelSettings } from '../../../shared/types'
import { ModelSettingsRow } from '../row-types'
import { DEFAULT_MODEL, DEFAULT_BASE_URL } from '../../../shared/constants'
import {
  DEFAULT_TERMINAL_COMPLETION_MODE,
  normalizeTerminalCompletionMode
} from '../../../shared/terminal-command-assist'
import { BaseRepository } from '../base-repository'

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  id: 'default',
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  defaultProviderId: undefined,
  defaultModelId: undefined,
  terminalCompletionMode: DEFAULT_TERMINAL_COMPLETION_MODE,
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
      defaultProviderId: row.defaultProviderId ?? undefined,
      defaultModelId: row.defaultModelId ?? undefined,
      terminalCompletionMode: normalizeTerminalCompletionMode(row.terminalCompletionMode),
      updatedAt: row.updatedAt
    }
  }

  saveSettings(settings: Partial<ModelSettings>): void {
    const existing = this.stmt('SELECT * FROM model_settings WHERE id = ?').get('default') as
      | ModelSettingsRow
      | undefined
    const now = Date.now()

    if (existing) {
      const defaultProviderId =
        settings.defaultProviderId === undefined
          ? existing.defaultProviderId
          : settings.defaultProviderId
      const defaultModelId =
        settings.defaultModelId === undefined ? existing.defaultModelId : settings.defaultModelId

      this.stmt(
        `
        UPDATE model_settings
        SET apiKey = ?,
            baseURL = ?,
            model = ?,
            defaultProviderId = ?,
            defaultModelId = ?,
            terminalCompletionMode = ?,
            updatedAt = ?
        WHERE id = ?
      `
      ).run(
        settings.apiKey ?? existing.apiKey,
        settings.baseURL ?? existing.baseURL,
        settings.model ?? existing.model,
        defaultProviderId ?? null,
        defaultModelId ?? null,
        settings.terminalCompletionMode
          ? normalizeTerminalCompletionMode(settings.terminalCompletionMode)
          : normalizeTerminalCompletionMode(existing.terminalCompletionMode),
        now,
        'default'
      )
    } else {
      this.stmt(
        `
        INSERT INTO model_settings (
          id,
          apiKey,
          baseURL,
          model,
          defaultProviderId,
          defaultModelId,
          terminalCompletionMode,
          updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        'default',
        settings.apiKey || DEFAULT_MODEL_SETTINGS.apiKey,
        settings.baseURL || DEFAULT_MODEL_SETTINGS.baseURL,
        settings.model || DEFAULT_MODEL_SETTINGS.model,
        settings.defaultProviderId || null,
        settings.defaultModelId || null,
        settings.terminalCompletionMode
          ? normalizeTerminalCompletionMode(settings.terminalCompletionMode)
          : DEFAULT_MODEL_SETTINGS.terminalCompletionMode,
        now
      )
    }
  }
}
