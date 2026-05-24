import { describe, expect, it } from 'vitest'
import { WORKSPACE_TERMINALS_TOPIC_ID } from '../../../shared/constants'
import type { TerminalSessionRow, TopicRow } from '../row-types'
import { TerminalSessionRepository } from '../repositories/terminal-session-repository'
import { TopicRepository } from '../repositories/topic-repository'

type TableRows = {
  topics: TopicRow[]
  terminal_sessions: TerminalSessionRow[]
}

function createRepositories(): {
  topics: TopicRepository
  sessions: TerminalSessionRepository
  rows: TableRows
} {
  const rows: TableRows = {
    topics: [],
    terminal_sessions: []
  }
  const db = {
    prepare: (sql: string) => new FakeStatement(rows, sql)
  }
  return {
    topics: new TopicRepository(db as never),
    sessions: new TerminalSessionRepository(db as never),
    rows
  }
}

class FakeStatement {
  constructor(
    private readonly rows: TableRows,
    private readonly sql: string
  ) {}

  run(...params: unknown[]): void {
    if (this.sql.includes('INSERT OR IGNORE INTO topics')) {
      const [id, title, hostIds, lastMessageAt, createdAt] = params
      const existing = this.rows.topics.find((row) => row.id === id)
      if (!existing) {
        this.rows.topics.push({
          id: String(id),
          title: String(title),
          hostIds: String(hostIds),
          selectedProviderId: null,
          selectedModelId: null,
          lastMessageAt: Number(lastMessageAt),
          createdAt: Number(createdAt)
        })
      }
      return
    }

    if (this.sql.includes('DELETE FROM topics WHERE id = ?')) {
      const [id] = params
      this.rows.topics = this.rows.topics.filter((row) => row.id !== id)
      return
    }

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
        isPinned,
        createdAt,
        name
      ] = params

      if (!this.rows.topics.some((row) => row.id === topicId)) {
        throw new Error('FOREIGN KEY constraint failed')
      }

      this.rows.terminal_sessions.push({
        id: String(id),
        topicId: String(topicId),
        hostId: String(hostId),
        hostAlias: String(hostAlias),
        role: role == null ? null : String(role),
        visible: visible == null ? null : Number(visible),
        status: String(status),
        shellType: shellType == null ? null : String(shellType),
        shellIntegrationReady: Number(shellIntegrationReady),
        isPinned: isPinned == null ? 0 : Number(isPinned),
        createdAt: Number(createdAt),
        closedAt: null,
        name: name == null ? null : String(name),
        agentNotes: null,
        isDeleted: 0,
        deletedAt: null,
        deletedBy: null
      })
    }
  }

  get(id: string): TopicRow | TerminalSessionRow | undefined {
    if (this.sql.includes('SELECT * FROM topics WHERE id = ?')) {
      return this.rows.topics.find((row) => row.id === id)
    }
    if (this.sql.includes('SELECT * FROM terminal_sessions WHERE id = ?')) {
      return this.rows.terminal_sessions.find((row) => row.id === id)
    }
    return undefined
  }
}

describe('workspace terminals topic invariant', () => {
  it('recreates the workspace terminals topic before terminal sessions are persisted', () => {
    const { topics, sessions } = createRepositories()

    expect(topics.getTopicById(WORKSPACE_TERMINALS_TOPIC_ID)).toBeUndefined()
    expect(() =>
      sessions.createSession({
        id: 'workspace-session-before-ensure',
        topicId: WORKSPACE_TERMINALS_TOPIC_ID,
        hostId: 'local',
        hostAlias: '本机',
        role: 'user',
        status: 'active',
        shellIntegrationReady: false,
        createdAt: Date.now()
      })
    ).toThrow('FOREIGN KEY constraint failed')

    topics.ensureWorkspaceTerminalsTopic()
    sessions.createSession({
      id: 'workspace-session-after-ensure',
      topicId: WORKSPACE_TERMINALS_TOPIC_ID,
      hostId: 'local',
      hostAlias: '本机',
      role: 'user',
      status: 'active',
      shellIntegrationReady: false,
      createdAt: Date.now()
    })

    expect(topics.getTopicById(WORKSPACE_TERMINALS_TOPIC_ID)?.title).toBe('Workspace Terminals')
    expect(sessions.getSessionById('workspace-session-after-ensure')?.topicId).toBe(
      WORKSPACE_TERMINALS_TOPIC_ID
    )
  })

  it('does not delete the internal workspace terminals topic', () => {
    const { topics } = createRepositories()

    topics.ensureWorkspaceTerminalsTopic()
    topics.deleteTopic(WORKSPACE_TERMINALS_TOPIC_ID)

    expect(topics.getTopicById(WORKSPACE_TERMINALS_TOPIC_ID)?.id).toBe(
      WORKSPACE_TERMINALS_TOPIC_ID
    )
  })
})
