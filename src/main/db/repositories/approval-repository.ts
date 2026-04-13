import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Approval } from '../../../shared/types'
import { ApprovalRow } from '../row-types'
import { mapApprovalRow } from '../mappers'
import { BaseRepository } from '../base-repository'

export class ApprovalRepository extends BaseRepository<ApprovalRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  getApprovalsByTaskId(taskId: string): Approval[] {
    const rows = this.stmt('SELECT * FROM approvals WHERE taskId = ? ORDER BY createdAt ASC').all(
      taskId
    ) as ApprovalRow[]
    return rows.map(mapApprovalRow)
  }

  createApproval(
    approval: Omit<Approval, 'id' | 'createdAt'> & Partial<Pick<Approval, 'id' | 'createdAt'>>
  ): Approval {
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

    this.stmt(
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
  }

  updateApprovalStatus(id: string, status: Approval['status']): Approval | undefined {
    const row = this.stmt('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined
    if (!row) return undefined

    const respondedAt = Date.now()
    this.stmt('UPDATE approvals SET status = ?, respondedAt = ? WHERE id = ?').run(
      status,
      respondedAt,
      id
    )

    return mapApprovalRow({ ...row, status, respondedAt })
  }
}
