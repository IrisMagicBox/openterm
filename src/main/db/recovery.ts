import type Database from 'better-sqlite3'

export function recoverInterruptedAgentRuns(db: Database.Database): void {
  const now = Date.now()
  db.prepare(
    `
    UPDATE agent_runs
    SET status = 'cancelled',
        error = COALESCE(error, 'Run was interrupted before shutdown completed.'),
        completedAt = COALESCE(completedAt, ?),
        updatedAt = ?
    WHERE status IN ('idle', 'running', 'waiting_approval', 'retrying', 'compacting')
  `
  ).run(now, now)

  db.prepare(
    `
    UPDATE agent_parts
    SET status = 'cancelled',
        error = COALESCE(error, 'Part was interrupted before shutdown completed.'),
        endedAt = COALESCE(endedAt, ?),
        updatedAt = ?
    WHERE status IN ('pending', 'running', 'blocked')
  `
  ).run(now, now)
}
