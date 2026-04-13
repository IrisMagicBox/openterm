import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { CommandPattern, TrustLevel } from '../../../shared/types'
import { CommandPatternRow } from '../row-types'
import { mapCommandPatternRow } from '../mappers'
import { BaseRepository } from '../base-repository'
import {
  TRUST_APPROVAL_THRESHOLD,
  TRUST_FAMILIAR_THRESHOLD,
  TRUST_REJECTION_THRESHOLD
} from '../../constants'

export class CommandPatternRepository extends BaseRepository<CommandPatternRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getPatternsByHost(hostId: string): CommandPattern[] {
    const rows = this.stmt(
      'SELECT * FROM command_patterns WHERE hostId = ? ORDER BY lastSeen DESC'
    ).all(hostId) as CommandPatternRow[]
    return rows.map(mapCommandPatternRow)
  }

  getPatternByHostAndPattern(hostId: string, commandPattern: string): CommandPattern | undefined {
    const row = this.stmt(
      'SELECT * FROM command_patterns WHERE hostId = ? AND commandPattern = ?'
    ).get(hostId, commandPattern) as CommandPatternRow | undefined
    return row ? mapCommandPatternRow(row) : undefined
  }

  createCommandPattern(pattern: Omit<CommandPattern, 'id' | 'createdAt'>): CommandPattern {
    const id = uuidv4()
    const now = Date.now()
    this.stmt(
      `INSERT INTO command_patterns (id, hostId, commandPattern, approvalCount, rejectionCount, trustLevel, lastSeen, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      pattern.hostId,
      pattern.commandPattern,
      pattern.approvalCount,
      pattern.rejectionCount,
      pattern.trustLevel,
      pattern.lastSeen,
      now
    )
    return { ...pattern, id, createdAt: now }
  }

  updatePatternTrust(id: string, trustLevel: TrustLevel): void {
    this.stmt('UPDATE command_patterns SET trustLevel = ?, lastSeen = ? WHERE id = ?').run(
      trustLevel,
      Date.now(),
      id
    )
  }

  incrementApprovalCount(id: string): void {
    const pattern = this.stmt('SELECT * FROM command_patterns WHERE id = ?').get(id) as
      | CommandPatternRow
      | undefined
    if (!pattern) return
    const newCount = pattern.approvalCount + 1
    let newTrust: TrustLevel = pattern.trustLevel as TrustLevel
    if (newCount >= TRUST_APPROVAL_THRESHOLD && pattern.rejectionCount === 0) {
      newTrust = 'trusted'
    } else if (
      newCount >= TRUST_FAMILIAR_THRESHOLD &&
      pattern.rejectionCount <= TRUST_REJECTION_THRESHOLD
    ) {
      newTrust = 'familiar'
    }
    this.stmt(
      'UPDATE command_patterns SET approvalCount = ?, trustLevel = ?, lastSeen = ? WHERE id = ?'
    ).run(newCount, newTrust, Date.now(), id)
  }

  incrementRejectionCount(id: string): void {
    const pattern = this.stmt('SELECT * FROM command_patterns WHERE id = ?').get(id) as
      | CommandPatternRow
      | undefined
    if (!pattern) return
    const newCount = pattern.rejectionCount + 1
    let newTrust: TrustLevel = pattern.trustLevel as TrustLevel
    if (newCount >= TRUST_FAMILIAR_THRESHOLD) {
      newTrust = 'untrusted'
    }
    this.stmt(
      'UPDATE command_patterns SET rejectionCount = ?, trustLevel = ?, lastSeen = ? WHERE id = ?'
    ).run(newCount, newTrust, Date.now(), id)
  }

  resetTrustByHost(hostId: string): void {
    this.stmt(
      "UPDATE command_patterns SET trustLevel = 'untrusted', approvalCount = 0, rejectionCount = 0 WHERE hostId = ?"
    ).run(hostId)
  }

  deletePatternsByHost(hostId: string): void {
    this.stmt('DELETE FROM command_patterns WHERE hostId = ?').run(hostId)
  }
}
