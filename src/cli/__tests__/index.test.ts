import { describe, expect, it } from 'vitest'
import { CliUsageError, parseCliArgs } from '../index'

describe('opentermctl arg parsing', () => {
  it('parses diagnose options', () => {
    expect(parseCliArgs(['diagnose', 'latest', '--focused', '--json', '--io-limit', '25'])).toEqual(
      {
        name: 'diagnose',
        targetId: 'latest',
        targetKind: 'auto',
        dbPath: undefined,
        outputFormat: 'json',
        diagnosticsOptions: {
          includeDeleted: false,
          terminalIOLimit: 25,
          scope: 'focused'
        }
      }
    )
  })

  it('parses topics list defaults', () => {
    expect(parseCliArgs(['topics'])).toEqual({
      name: 'topics-list',
      dbPath: undefined,
      limit: 20,
      outputFormat: 'plain'
    })
  })

  it('parses run commands after separator', () => {
    expect(parseCliArgs(['run', '--cwd', '/tmp', '--', 'npm', 'test'])).toEqual({
      name: 'run',
      command: ['npm', 'test'],
      shellCommand: undefined,
      cwd: '/tmp',
      timeoutMs: 120000,
      outputFormat: 'plain'
    })
  })

  it('parses chat send controls', () => {
    expect(
      parseCliArgs(['chat', 'send', '--new-topic', '--yes', '--host', 'local', '你好'])
    ).toEqual({
      name: 'chat-send',
      content: '你好',
      topicId: undefined,
      createTopic: true,
      title: undefined,
      hostIds: ['local'],
      dbPath: undefined,
      outputFormat: 'plain',
      agentName: 'build',
      autoApprove: true,
      events: false,
      timeoutMs: 600000,
      keepTerminals: false
    })
  })

  it('parses terminal output defaults', () => {
    expect(
      parseCliArgs(['terminal', 'output', 'latest', '--topic', 'latest', '--tail', '20'])
    ).toEqual({
      name: 'terminal-output',
      sessionId: 'latest',
      topicId: 'latest',
      dbPath: undefined,
      outputFormat: 'plain',
      limit: 20,
      includeDeleted: false,
      raw: false
    })
  })

  it('parses app status controls', () => {
    expect(parseCliArgs(['app', 'status', '--json'])).toEqual({
      name: 'app-status',
      outputFormat: 'json'
    })
  })

  it('parses leading global options', () => {
    expect(parseCliArgs(['--json', 'hosts', 'list'])).toEqual({
      name: 'hosts-list',
      outputFormat: 'json'
    })
  })

  it('parses host creation', () => {
    expect(
      parseCliArgs([
        'hosts',
        'create',
        '--alias',
        'prod',
        '--ip',
        '10.0.0.5',
        '--username',
        'root',
        '--port',
        '22',
        '--tags',
        'prod,linux'
      ])
    ).toEqual({
      name: 'hosts-create',
      outputFormat: 'plain',
      host: {
        alias: 'prod',
        ip: '10.0.0.5',
        port: 22,
        username: 'root',
        password: undefined,
        keyPath: undefined,
        tags: ['prod', 'linux'],
        agentNotes: undefined
      }
    })
  })

  it('parses run watch commands', () => {
    expect(parseCliArgs(['runs', 'watch', 'latest', '--timeout-ms', '1000'])).toEqual({
      name: 'runs-watch',
      outputFormat: 'plain',
      timeoutMs: 1000,
      id: 'latest'
    })
  })

  it('parses terminal control commands', () => {
    expect(parseCliArgs(['terminal', 'open', '--topic', 'latest', '--host', 'local'])).toEqual({
      name: 'terminal-open',
      outputFormat: 'plain',
      topicId: 'latest',
      hostId: 'local',
      terminalName: undefined,
      role: 'user'
    })
  })

  it('parses doctor check selection', () => {
    expect(parseCliArgs(['doctor', '--no-tests', '--lint'])).toEqual({
      name: 'doctor',
      outputFormat: 'plain',
      timeoutMs: 300000,
      checks: ['typecheck', 'lint']
    })
  })

  it('throws on missing run command', () => {
    expect(() => parseCliArgs(['run'])).toThrow(CliUsageError)
  })
})
