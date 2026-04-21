import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  buildConversationDiagnostics,
  formatConversationDiagnosticsMarkdown
} from '../conversation-diagnostics'

type DbRow = Record<string, unknown>
type DbTables = Record<string, DbRow[]>

describe('conversation diagnostics', (): void => {
  it('builds a topic report with related messages, tools, terminal commands, hosts, and memories', (): void => {
    const report = buildConversationDiagnostics(createDiagnosticDb(), {
      id: 'topic-1',
      kind: 'topic'
    })

    expect(report.topic.title).toBe('Investigate failing tests')
    expect(report.summary).toMatchObject({
      messageCount: 2,
      taskCount: 1,
      runCount: 2,
      partCount: 3,
      toolCallCount: 2,
      terminalSessionCount: 1,
      terminalCommandCount: 2,
      failedCommandCount: 1,
      hostCount: 1
    })
    expect(report.hosts[0].host.alias).toBe('prod')
    expect(report.hosts[0].references).toEqual([
      'topic',
      'task_steps',
      'agent_parts',
      'terminal_sessions',
      'terminal_io'
    ])
    expect(report.agentRuns[0].childRunIds).toEqual(['run-child'])
    expect(report.agentRuns[0].parts.map((entry) => entry.part.toolName)).toContain(
      'execute_command'
    )
    expect(report.terminalCommands.map((command) => command.command)).toEqual([
      'npm test',
      'bad-command'
    ])
    expect(report.terminalCommands[0].output?.content).toContain('151 passed')
    expect(report.memories[0].content).toBe('prod uses zsh')
    expect(report.commandPatterns[0].commandPattern).toBe('npm test')
  })

  it('resolves focused reports from run, message, terminal session, and terminal IO ids', (): void => {
    const fromRun = buildConversationDiagnostics(
      createDiagnosticDb(),
      { id: 'run-1', kind: 'run' },
      { scope: 'focused' }
    )
    const fromMessage = buildConversationDiagnostics(
      createDiagnosticDb(),
      { id: 'msg-2', kind: 'auto' },
      { scope: 'focused' }
    )
    const fromSession = buildConversationDiagnostics(
      createDiagnosticDb(),
      { id: 'session-1', kind: 'auto' },
      { scope: 'focused' }
    )
    const fromTerminalIO = buildConversationDiagnostics(
      createDiagnosticDb(),
      { id: 'io-out-2', kind: 'terminal_io' },
      { scope: 'focused' }
    )

    expect(fromRun.target).toMatchObject({ kind: 'run', topicId: 'topic-1', taskId: 'task-1' })
    expect(fromRun.agentRuns.map((entry) => entry.run.id)).toEqual(['run-1', 'run-child'])
    expect(fromMessage.target).toMatchObject({
      kind: 'message',
      topicId: 'topic-1',
      runId: 'run-1'
    })
    expect(fromMessage.messages.map((entry) => entry.message.id)).toContain('msg-2')
    expect(fromSession.target).toMatchObject({
      kind: 'terminal_session',
      topicId: 'topic-1'
    })
    expect(fromSession.terminalSessions).toHaveLength(1)
    expect(fromTerminalIO.target).toMatchObject({
      kind: 'terminal_io',
      topicId: 'topic-1',
      terminalSessionId: 'session-1'
    })
    expect(fromTerminalIO.terminalCommands.map((command) => command.command)).toContain(
      'bad-command'
    )
  })

  it('collects failures from tasks, steps, runs, parts, commands, and approvals', (): void => {
    const report = buildConversationDiagnostics(createDiagnosticDb(), { id: 'topic-1' })
    const sources = report.errors.map((error) => error.source)

    expect(sources).toEqual(
      expect.arrayContaining([
        'task_step',
        'task',
        'agent_run',
        'agent_part',
        'terminal_command',
        'approval'
      ])
    )
    expect(sources).toHaveLength(6)
    expect(report.errors.find((error) => error.source === 'terminal_command')?.context).toContain(
      'not found'
    )
  })

  it('formats a compact markdown report for agent-readable debugging', (): void => {
    const report = buildConversationDiagnostics(createDiagnosticDb(), { id: 'latest' })
    const markdown = formatConversationDiagnosticsMarkdown(report, 80)

    expect(markdown).toContain('# Conversation Diagnostics')
    expect(markdown).toContain('Topic: Investigate failing tests (topic-1)')
    expect(markdown).toContain('## Terminal Commands')
    expect(markdown).toContain('bad-command')
    expect(markdown).toContain('## Errors')
  })
})

function createDiagnosticDb(): Database.Database {
  return new FakeDatabase(createDiagnosticTables()) as unknown as Database.Database
}

class FakeDatabase {
  constructor(private readonly tables: DbTables) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.tables, sql)
  }
}

class FakeStatement {
  constructor(
    private readonly tables: DbTables,
    private readonly sql: string
  ) {}

  get(...params: unknown[]): unknown {
    return this.query(params)[0]
  }

  all(...params: unknown[]): unknown[] {
    return this.query(params)
  }

  private query(params: unknown[]): DbRow[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim()

    if (sql.includes("FROM sqlite_master WHERE type = 'table' AND name = ?")) {
      const tableName = String(params[0])
      return this.tables[tableName] ? [{ name: tableName }] : []
    }

    if (sql.startsWith('PRAGMA table_info(')) {
      const tableName = sql.slice('PRAGMA table_info('.length, -1)
      const firstRow = this.rows(tableName)[0]
      return firstRow ? Object.keys(firstRow).map((name) => ({ name })) : []
    }

    if (sql === 'SELECT * FROM topics ORDER BY lastMessageAt DESC, createdAt DESC LIMIT 1') {
      return this.rows('topics').sort(desc('lastMessageAt', 'createdAt')).slice(0, 1)
    }

    const byId = sql.match(/^SELECT \* FROM ([a-z_]+) WHERE id = \?$/)
    if (byId) return this.rows(byId[1]).filter((row) => row.id === params[0])

    if (sql.includes('FROM messages WHERE topicId = ?')) {
      return byTopic(this.rows('messages'), params[0]).sort(asc('timestamp'))
    }

    if (sql.includes('FROM tasks WHERE topicId = ?')) {
      return byTopic(this.rows('tasks'), params[0]).sort(asc('createdAt'))
    }

    if (sql.includes('FROM task_steps s JOIN tasks t ON t.id = s.taskId')) {
      const taskIds = new Set(byTopic(this.rows('tasks'), params[0]).map((task) => task.id))
      return this.rows('task_steps')
        .filter((step) => taskIds.has(step.taskId))
        .sort(asc('createdAt'))
    }

    if (sql.includes('FROM agent_runs WHERE topicId = ?')) {
      return byTopic(this.rows('agent_runs'), params[0]).sort(asc('createdAt'))
    }

    if (sql.includes('FROM agent_parts p JOIN agent_runs r ON r.id = p.runId')) {
      const runIds = new Set(byTopic(this.rows('agent_runs'), params[0]).map((run) => run.id))
      return this.rows('agent_parts')
        .filter((part) => runIds.has(part.runId))
        .sort(asc('orderIndex', 'createdAt'))
    }

    if (sql.includes('FROM terminal_sessions WHERE topicId = ?')) {
      return byTopic(this.rows('terminal_sessions'), params[0])
        .filter((row) => !sql.includes('COALESCE(isDeleted') || row.isDeleted !== 1)
        .sort(asc('createdAt'))
    }

    if (sql.includes('FROM terminal_io')) {
      const limit = Number(params[1])
      return byTopic(this.rows('terminal_io'), params[0])
        .filter((row) => !sql.includes('COALESCE(isDeleted') || row.isDeleted !== 1)
        .sort(desc('timestamp'))
        .slice(0, limit)
        .sort(asc('timestamp', 'chunkIndex'))
    }

    if (sql.includes('FROM approvals a JOIN tasks t ON t.id = a.taskId')) {
      const taskIds = new Set(byTopic(this.rows('tasks'), params[0]).map((task) => task.id))
      return this.rows('approvals')
        .filter((approval) => taskIds.has(approval.taskId))
        .sort(asc('createdAt'))
    }

    if (sql.includes('FROM artifacts a JOIN tasks t ON t.id = a.taskId')) {
      const taskIds = new Set(byTopic(this.rows('tasks'), params[0]).map((task) => task.id))
      return this.rows('artifacts')
        .filter((artifact) => taskIds.has(artifact.taskId))
        .sort(asc('createdAt'))
    }

    if (sql.includes('FROM hosts WHERE id IN')) {
      const hostIds = new Set(params)
      return this.rows('hosts')
        .filter((host) => hostIds.has(host.id))
        .sort(asc('createdAt'))
    }

    if (sql.includes('FROM memories')) {
      const topicId = params[0]
      const hostIds = new Set(params.slice(1))
      return this.rows('memories')
        .filter((memory) => memory.topicId === topicId || hostIds.has(memory.hostId))
        .sort(asc('timestamp'))
    }

    if (sql.includes('FROM command_patterns')) {
      const hostIds = new Set(params)
      return this.rows('command_patterns')
        .filter((pattern) => hostIds.has(pattern.hostId))
        .sort(desc('lastSeen'))
    }

    throw new Error(`Unhandled diagnostic SQL: ${sql}`)
  }

  private rows(tableName: string): DbRow[] {
    return [...(this.tables[tableName] ?? [])]
  }
}

function byTopic(rows: DbRow[], topicId: unknown): DbRow[] {
  return rows.filter((row) => row.topicId === topicId)
}

function asc(...keys: string[]): (left: DbRow, right: DbRow) => number {
  return (left, right): number => compareRows(left, right, keys, 1)
}

function desc(...keys: string[]): (left: DbRow, right: DbRow) => number {
  return (left, right): number => compareRows(left, right, keys, -1)
}

function compareRows(left: DbRow, right: DbRow, keys: string[], direction: 1 | -1): number {
  for (const key of keys) {
    const leftValue = Number(left[key] ?? 0)
    const rightValue = Number(right[key] ?? 0)
    if (leftValue !== rightValue) return (leftValue - rightValue) * direction
  }
  return 0
}

function createDiagnosticTables(): DbTables {
  const now = 1_700_000_000_000
  return {
    topics: [
      {
        id: 'topic-1',
        title: 'Investigate failing tests',
        hostIds: '["host-prod"]',
        lastMessageAt: now + 10,
        createdAt: now,
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-test'
      }
    ],
    hosts: [
      {
        id: 'host-prod',
        alias: 'prod',
        ip: '10.0.0.8',
        port: 22,
        username: 'ubuntu',
        password: null,
        keyPath: null,
        tags: '["prod"]',
        createdAt: now,
        agentNotes: 'primary'
      }
    ],
    messages: [
      {
        id: 'msg-1',
        topicId: 'topic-1',
        runId: null,
        role: 'user',
        content: 'why did tests fail?',
        thought: null,
        toolCalls: null,
        toolCallId: null,
        name: null,
        metadata: '{"taskId":"task-1"}',
        timestamp: now + 1
      },
      {
        id: 'msg-2',
        topicId: 'topic-1',
        runId: 'run-1',
        role: 'assistant',
        content: 'I ran the tests and found a missing command.',
        thought: null,
        toolCalls:
          '[{"id":"call-1","type":"function","function":{"name":"execute_command","arguments":"{\\"command\\":\\"npm test\\"}"}}]',
        toolCallId: null,
        name: null,
        metadata: '{"taskId":"task-1"}',
        timestamp: now + 2
      }
    ],
    tasks: [
      {
        id: 'task-1',
        topicId: 'topic-1',
        title: 'Investigate tests',
        goal: 'Find test failure',
        status: 'failed',
        summary: 'bad-command failed',
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-test',
        createdAt: now + 3,
        updatedAt: now + 30
      }
    ],
    task_steps: [
      {
        id: 'step-1',
        taskId: 'task-1',
        type: 'command',
        status: 'failed',
        hostId: 'host-prod',
        title: 'Run bad command',
        content: '{"command":"bad-command"}',
        rawOutput: 'bad-command: not found',
        metadata: '{"sessionId":"session-1"}',
        startedAt: now + 4,
        endedAt: now + 5,
        createdAt: now + 4,
        updatedAt: now + 5
      }
    ],
    agent_runs: [
      {
        id: 'run-1',
        topicId: 'topic-1',
        taskId: 'task-1',
        parentRunId: null,
        parentPartId: null,
        agentName: 'build',
        mode: 'primary',
        status: 'failed',
        goal: 'Find test failure',
        providerId: 'openai',
        modelId: 'gpt-test',
        usage: '{"totalTokens":42}',
        error: 'tool execution failed',
        createdAt: now + 6,
        updatedAt: now + 30,
        completedAt: now + 30
      },
      {
        id: 'run-child',
        topicId: 'topic-1',
        taskId: 'task-1',
        parentRunId: 'run-1',
        parentPartId: 'part-3',
        agentName: 'explore',
        mode: 'subagent',
        status: 'completed',
        goal: 'Inspect logs',
        providerId: 'openai',
        modelId: 'gpt-test',
        usage: '{"totalTokens":10}',
        error: null,
        createdAt: now + 7,
        updatedAt: now + 8,
        completedAt: now + 8
      }
    ],
    agent_parts: [
      agentPartRow(
        'part-1',
        'completed',
        'call-1',
        '{"command":"npm test"}',
        '{"exitCode":0}',
        null,
        0,
        now + 9
      ),
      agentPartRow(
        'part-2',
        'error',
        'call-2',
        '{"command":"bad-command"}',
        'bad-command: not found',
        'bad-command: not found',
        1,
        now + 10
      ),
      {
        ...agentPartRow(
          'part-3',
          'completed',
          'call-3',
          '{"description":"Inspect logs"}',
          'done',
          null,
          2,
          now + 11
        ),
        type: 'subagent',
        toolName: 'task'
      }
    ],
    terminal_sessions: [
      {
        id: 'session-1',
        topicId: 'topic-1',
        hostId: 'host-prod',
        hostAlias: 'prod',
        status: 'closed',
        shellType: 'zsh',
        shellIntegrationReady: 1,
        createdAt: now + 12,
        closedAt: now + 40,
        name: 'prod shell',
        agentNotes: 'used by agent',
        isDeleted: 0,
        deletedAt: null,
        deletedBy: null
      }
    ],
    terminal_io: [
      terminalIORow('io-in-1', 'input', 'npm test', null, null, null, now + 13),
      terminalIORow('io-out-1', 'output', '151 passed', 'io-in-1', 0, 123, now + 14),
      terminalIORow('io-in-2', 'input', 'bad-command', null, null, null, now + 15),
      terminalIORow('io-out-2', 'output', 'bad-command: not found', 'io-in-2', 127, 6, now + 16)
    ],
    approvals: [
      {
        id: 'approval-1',
        taskId: 'task-1',
        stepId: 'step-1',
        command: 'bad-command',
        riskLevel: 'medium',
        reason: 'manual check',
        status: 'rejected',
        createdAt: now + 17,
        respondedAt: now + 18
      }
    ],
    artifacts: [
      {
        id: 'artifact-1',
        taskId: 'task-1',
        type: 'log',
        title: 'failure log',
        content: 'bad-command: not found',
        metadata: null,
        createdAt: now + 19,
        updatedAt: now + 19
      }
    ],
    memories: [
      {
        id: 'memory-1',
        type: 'host_fact',
        content: 'prod uses zsh',
        hostId: 'host-prod',
        topicId: 'topic-1',
        importance: 4,
        timestamp: now + 20
      }
    ],
    command_patterns: [
      {
        id: 'pattern-1',
        hostId: 'host-prod',
        commandPattern: 'npm test',
        approvalCount: 3,
        rejectionCount: 0,
        trustLevel: 'trusted',
        lastSeen: now + 21,
        createdAt: now + 21
      }
    ]
  }
}

function agentPartRow(
  id: string,
  status: string,
  toolCallId: string,
  input: string,
  output: string,
  error: string | null,
  orderIndex: number,
  timestamp: number
): DbRow {
  return {
    id,
    runId: 'run-1',
    messageId: id === 'part-1' ? 'msg-2' : null,
    parentPartId: null,
    type: 'tool',
    status,
    role: 'tool',
    toolName: 'execute_command',
    toolCallId,
    hostId: 'host-prod',
    sessionId: 'session-1',
    input,
    output,
    error,
    metadata: '{"cwd":"/repo"}',
    orderIndex,
    startedAt: timestamp,
    endedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function terminalIORow(
  id: string,
  type: 'input' | 'output',
  content: string,
  relatedInputId: string | null,
  exitCode: number | null,
  durationMs: number | null,
  timestamp: number
): DbRow {
  return {
    id,
    sessionId: 'session-1',
    topicId: 'topic-1',
    hostId: 'host-prod',
    type,
    source: 'agent',
    content,
    exitCode,
    durationMs,
    relatedInputId,
    isStreaming: 0,
    chunkIndex: 0,
    isTruncated: 0,
    cwd: '/repo',
    taskId: 'task-1',
    stepId: 'step-1',
    timestamp,
    isDeleted: 0,
    deletedAt: null,
    deletedBy: null
  }
}
