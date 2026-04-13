import Database from 'better-sqlite3'
import { PermissionSettings } from '../../../shared/types'
import { PermissionRow } from '../row-types'
import { BaseRepository } from '../base-repository'

const DEFAULT_PERMISSIONS: PermissionSettings = {
  requireConfirmation: true,
  autoExecuteSafeOperations: true,
  updatedAt: Date.now()
}

export class PermissionRepository extends BaseRepository<PermissionRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getPermissions(): PermissionSettings {
    const row = this.stmt('SELECT * FROM permissions WHERE id = ?').get('default') as
      | PermissionRow
      | undefined
    if (!row) {
      this.savePermissions(DEFAULT_PERMISSIONS)
      return DEFAULT_PERMISSIONS
    }
    return {
      requireConfirmation: row.requireConfirmation === 1,
      autoExecuteSafeOperations: row.autoExecuteSafeOperations === 1,
      updatedAt: row.updatedAt
    }
  }

  savePermissions(permissions: Partial<PermissionSettings>): void {
    const existing = this.stmt('SELECT * FROM permissions WHERE id = ?').get('default') as
      | PermissionRow
      | undefined
    const now = Date.now()

    if (existing) {
      this.stmt(
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
      this.stmt(
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
