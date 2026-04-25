import { describe, expect, it } from 'vitest'
import { TerminalSessionRepository } from '../repositories/terminal-session-repository'
import type { TerminalSessionRow } from '../row-types'

function createRepo(): TerminalSessionRepository {
  const rows: TerminalSessionRow[] = []
  const db = {
    prepare: (sql: string) => new FakeStatement(rows, sql)
  }
  return new TerminalSessionRepository(db as never)
}

class FakeStatement {
  constructor(
    private readonly rows: TerminalSessionRow[],
    private readonly sql: string
  ) {}

  run(...params: unknown[]): void {
    if (this.sql.includes('INSERT INTO terminal_sessions')) {
      const [
        id,
        topicId,
        hostId,
        hostAlias,
        role,
        visible,
        status,
        shellType,
        shellIntegrationReady,
        createdAt,
        name
      ] = params
      this.rows.push({
        id: String(id),
        topicId: String(topicId),
        hostId: String(hostId),
        hostAlias: String(hostAlias),
        role: role == null ? null : String(role),
        visible: visible == null ? null : Number(visible),
        status: String(status),
        shellType: shellType == null ? null : String(shellType),
        shellIntegrationReady: Number(shellIntegrationReady),
        createdAt: Number(createdAt),
        closedAt: null,
        name: name == null ? null : String(name),
        agentNotes: null,
        isDeleted: 0,
        deletedAt: null,
        deletedBy: null
      })
      return
    }

    if (this.sql.includes('UPDATE terminal_sessions SET name = ? WHERE id = ?')) {
      const [name, id] = params
      const row = this.rows.find((item) => item.id === id)
      if (row) row.name = String(name)
    }

    if (this.sql.includes('UPDATE terminal_sessions SET visible = ? WHERE id = ?')) {
      const [visible, id] = params
      const row = this.rows.find((item) => item.id === id)
      if (row) row.visible = Number(visible)
    }
  }

  get(id: string): TerminalSessionRow | undefined {
    return this.rows.find((row) => row.id === id)
  }

  all(hostId: string): TerminalSessionRow[] {
    return this.rows.filter((row) => row.hostId === hostId)
  }
}

describe('TerminalSessionRepository', () => {
  it('maps terminal session names from single and host lookups', () => {
    const repo = createRepo()
    repo.createSession({
      id: 'session-1',
      topicId: 'topic-1',
      hostId: 'local',
      hostAlias: '本地终端',
      role: 'user',
      name: 'work',
      status: 'active',
      shellIntegrationReady: false,
      createdAt: 1
    })

    expect(repo.getSessionById('session-1')?.name).toBe('work')

    repo.updateSessionName('session-1', 'renamed')

    expect(repo.getSessionById('session-1')?.name).toBe('renamed')
    expect(repo.getSessionsByHost('local')[0].name).toBe('renamed')
  })

  it('persists explicit terminal visibility', () => {
    const repo = createRepo()
    repo.createSession({
      id: 'session-2',
      topicId: 'topic-1',
      hostId: 'local',
      hostAlias: '本地终端',
      role: 'agent_command',
      visible: true,
      status: 'active',
      shellIntegrationReady: false,
      createdAt: 1
    })

    expect(repo.getSessionById('session-2')?.visible).toBe(true)

    repo.updateSessionVisibility('session-2', false)

    expect(repo.getSessionById('session-2')?.visible).toBe(false)
  })
})
