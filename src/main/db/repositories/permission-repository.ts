import Database from 'better-sqlite3'
import { PermissionMode, PermissionSettings } from '../../../shared/types'
import { PermissionRow } from '../row-types'
import { BaseRepository } from '../base-repository'

const DEFAULT_PERMISSIONS: PermissionSettings = {
  permissionMode: 'default',
  updatedAt: Date.now()
}

function normalizePermissionMode(value: unknown): PermissionMode | null {
  if (value === 'default' || value === 'auto_review' || value === 'full_access') return value
  return null
}

function derivePermissionMode(
  row: Pick<PermissionRow, 'permissionMode' | 'requireConfirmation' | 'autoExecuteSafeOperations'>
): PermissionMode {
  const explicitMode = normalizePermissionMode(row.permissionMode)
  if (explicitMode) return explicitMode
  if (row.requireConfirmation === 0) return 'full_access'
  if (row.autoExecuteSafeOperations === 1) return 'auto_review'
  return 'default'
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
      permissionMode: derivePermissionMode(row),
      updatedAt: row.updatedAt
    }
  }

  savePermissions(permissions: Pick<PermissionSettings, 'permissionMode'>): void {
    const existing = this.stmt('SELECT * FROM permissions WHERE id = ?').get('default') as
      | PermissionRow
      | undefined
    const now = Date.now()
    const nextMode =
      normalizePermissionMode(permissions.permissionMode) ??
      (existing ? derivePermissionMode(existing) : DEFAULT_PERMISSIONS.permissionMode)

    if (existing) {
      this.stmt(
        `
        UPDATE permissions
        SET permissionMode = ?,
            updatedAt = ?
        WHERE id = ?
      `
      ).run(nextMode, now, 'default')
    } else {
      this.stmt(
        `
        INSERT INTO permissions (id, permissionMode, updatedAt)
        VALUES (?, ?, ?)
      `
      ).run('default', nextMode, now)
    }
  }
}
