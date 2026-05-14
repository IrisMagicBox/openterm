import Database from 'better-sqlite3'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import {
  mapAgentPartRow,
  mapAgentRunRow,
  mapApprovalRow,
  mapArtifactRow,
  mapHostRow,
  mapMemoryRow,
  mapModelRow,
  mapProviderRow,
  mapTaskRow,
  mapTaskStepRow,
  mapTerminalSessionRow,
  mapTopicRow,
  parseJSON
} from '../main/db/mappers'
import type {
  AgentPartRow,
  AgentRunRow,
  ApprovalRow,
  ArtifactRow,
  HostRow,
  MemoryRow,
  ModelRow,
  ProviderRow,
  TaskRow,
  TaskStepRow,
  TerminalSessionRow,
  TopicRow
} from '../main/db/row-types'
import {
  getCliControlSocketPath,
  type CliControlRequest,
  type CliControlResponse
} from '../main/cli-control-protocol'
import type {
  AgentPart,
  AgentRun,
  Approval,
  Artifact,
  Host,
  MemoryEntry,
  Model,
  PermissionMode,
  PermissionSettings,
  Provider,
  Task,
  TaskStep,
  TerminalSession,
  Topic
} from '../shared/types'

type OutputFormat = 'plain' | 'json'

export interface FullCliCommand {
  name: string
  outputFormat?: OutputFormat
  dbPath?: string
  liveOnly?: boolean
  timeoutMs?: number
  [key: string]: unknown
}

interface CliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>
  stderr: Pick<NodeJS.WriteStream, 'write'>
}

interface LiveControlResult {
  available: boolean
  data?: unknown
}

class FullCliUsageError extends Error {}

type CommonCliOptions = Omit<FullCliCommand, 'name'>

const READONLY_TOPICS = new Set(['list', 'show'])
const READONLY_CHAT = new Set(['send', 'ask', 'history', 'messages'])
const READONLY_TERMINAL = new Set(['list', 'sessions', 'count', 'output', 'show', 'tail'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function parseFullCliArgs(command: string, rest: string[]): FullCliCommand | undefined {
  try {
    if (command === 'app') return parseAppArgs(rest)
    if (command === 'hosts' || command === 'host') return parseHostsArgs(rest)
    if (
      (command === 'topics' || command === 'topic') &&
      !READONLY_TOPICS.has(firstSubcommand(rest, 'list'))
    ) {
      return parseFullTopicsArgs(rest)
    }
    if (
      (command === 'chat' || command === 'message') &&
      !READONLY_CHAT.has(firstSubcommand(rest, 'send'))
    ) {
      return parseChatWatchArgs(rest)
    }
    if (command === 'runs' || command === 'runlog') return parseRunsArgs(rest)
    if (command === 'approvals' || command === 'approval') return parseApprovalsArgs(rest)
    if (command === 'tasks' || command === 'task') return parseTasksArgs(rest)
    if (command === 'artifacts' || command === 'artifact') return parseArtifactsArgs(rest)
    if (
      (command === 'terminal' || command === 'term' || command === 'terminals') &&
      !READONLY_TERMINAL.has(firstSubcommand(rest, 'list'))
    ) {
      return parseFullTerminalArgs(rest)
    }
    if (command === 'files' || command === 'file') return parseFilesArgs(rest)
    if (command === 'pf' || command === 'port-forward') return parsePortForwardArgs(rest)
    if (command === 'settings' || command === 'setting') return parseSettingsArgs(rest)
    if (command === 'memory' || command === 'memories') return parseMemoryArgs(rest)
    if (command === 'history') return parseHistoryArgs(rest)
    if (command === 'sessions' || command === 'session') return parseSessionsArgs(rest)
    if (command === 'debug') return parseDebugArgs(rest)
    return undefined
  } catch (error) {
    if (error instanceof FullCliUsageError) {
      const usageError = new Error(error.message)
      usageError.name = 'CliUsageError'
      throw usageError
    }
    throw error
  }
}

function firstSubcommand(argv: string[], fallback: string): string {
  const first = argv[0]
  return first && !first.startsWith('--') ? first : fallback
}

export function isFullCliCommand(command: { name: string }): boolean {
  return (
    command.name.startsWith('app-') ||
    command.name.startsWith('hosts-') ||
    command.name.startsWith('topics-') ||
    command.name.startsWith('chat-watch') ||
    command.name.startsWith('runs-') ||
    command.name.startsWith('approvals-') ||
    command.name.startsWith('tasks-') ||
    command.name.startsWith('artifacts-') ||
    command.name.startsWith('terminal-') ||
    command.name.startsWith('files-') ||
    command.name.startsWith('pf-') ||
    command.name.startsWith('settings-') ||
    command.name.startsWith('memory-') ||
    command.name.startsWith('history-') ||
    command.name.startsWith('sessions-') ||
    command.name.startsWith('debug-')
  )
}

export async function executeFullCliCommand(command: FullCliCommand, io: CliIO): Promise<number> {
  switch (command.name) {
    case 'app-ping':
      return executeLiveRead(command, io, 'ping', {}, formatGeneric('App is online.'))
    case 'app-status':
      return executeAppStatus(command, io)
    case 'hosts-list':
      return executeHostsList(command, io)
    case 'hosts-show':
      return executeHostsShow(command, io)
    case 'hosts-create':
    case 'hosts-delete':
    case 'topics-create':
    case 'topics-rename':
    case 'topics-delete':
    case 'topics-model-set':
    case 'topics-hosts-add':
    case 'topics-hosts-remove':
    case 'topics-hosts-set':
    case 'runs-cancel':
    case 'runs-resume':
    case 'approvals-approve':
    case 'approvals-reject':
    case 'terminal-open':
    case 'terminal-input':
    case 'terminal-resize':
    case 'terminal-attach':
    case 'terminal-close':
    case 'terminal-rename':
    case 'terminal-pin':
    case 'terminal-pause':
    case 'terminal-execute':
    case 'files-sftp-connect':
    case 'files-sftp-upload':
    case 'files-sftp-download':
    case 'files-sftp-mkdir':
    case 'files-sftp-rm':
    case 'files-sftp-close':
    case 'files-transfer-start':
    case 'pf-create':
    case 'pf-close':
    case 'settings-providers-save':
    case 'settings-providers-delete':
    case 'settings-providers-test':
    case 'settings-providers-fetch-models':
    case 'settings-models-save':
    case 'settings-models-delete':
    case 'settings-permissions-set':
    case 'settings-model-settings-save':
    case 'memory-create':
    case 'memory-update':
    case 'memory-delete':
    case 'memory-global-import':
    case 'memory-global-clear':
    case 'memory-global-fact-create':
    case 'memory-global-fact-update':
    case 'memory-global-fact-delete':
      return executeLiveMutation(command, io)
    case 'topics-hosts-list':
      return executeTopicHostsList(command, io)
    case 'chat-watch':
    case 'runs-watch':
      return watchRun(command, io)
    case 'runs-list':
      return executeRunsList(command, io)
    case 'runs-show':
      return executeRunsShow(command, io)
    case 'runs-parts':
      return executeRunParts(command, io)
    case 'approvals-list':
      return executeApprovalsList(command, io)
    case 'approvals-show':
      return executeApprovalsShow(command, io)
    case 'tasks-list':
      return executeTasksList(command, io)
    case 'tasks-show':
      return executeTasksShow(command, io)
    case 'tasks-steps':
      return executeTaskSteps(command, io)
    case 'artifacts-list':
      return executeArtifactsList(command, io)
    case 'artifacts-show':
      return executeArtifactsShow(command, io)
    case 'artifacts-export':
      return executeArtifactsExport(command, io)
    case 'files-local-ls':
    case 'files-local-upload':
    case 'files-local-download':
    case 'files-local-mkdir':
    case 'files-local-rm':
      return executeLocalFileCommand(command, io)
    case 'files-sftp-ls':
      return executeLiveRead(
        command,
        io,
        'files.sftp.ls',
        pick(command, 'sessionId', 'path'),
        formatFileEntries
      )
    case 'files-transfer-watch':
      return watchUnsupported(command, io, 'Transfer progress is emitted by files transfer start.')
    case 'pf-list':
      return executeLiveRead(command, io, 'pf.list', pick(command, 'hostId'), formatPortForwards)
    case 'settings-providers-list':
      return executeProvidersList(command, io)
    case 'settings-providers-show':
      return executeProvidersShow(command, io)
    case 'settings-models-list':
      return executeModelsList(command, io)
    case 'settings-models-show':
      return executeModelsShow(command, io)
    case 'settings-permissions-get':
      return executePermissionsGet(command, io)
    case 'settings-model-settings-get':
      return executeModelSettingsGet(command, io)
    case 'memory-list':
      return executeMemoryList(command, io)
    case 'memory-global-get':
      return executeGlobalMemoryGet(command, io)
    case 'history-search':
      return executeHistorySearch(command, io)
    case 'sessions-recoverable':
      return executeRecoverableSessions(command, io)
    case 'sessions-watch':
      return watchRecoverableSessions(command, io)
    case 'debug-logs':
      return executeDebugLogs(command, io)
    default:
      throw new Error(`Unsupported CLI command: ${command.name}`)
  }
}

function parseAppArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'status', ...rest] = argv
  const common = parseCommon(rest)
  if (subcommand === 'status') return { name: 'app-status', ...common }
  if (subcommand === 'ping') return { name: 'app-ping', ...common }
  throw usage(`Unknown app subcommand: ${subcommand}`)
}

function parseHostsArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') return { name: 'hosts-list', ...parseCommon(rest) }
  if (subcommand === 'show') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'hosts-show', ...parsed.common, id: parsed.values.id }
  }
  if (subcommand === 'create') {
    const parsed = parseFlags(rest, {
      required: ['alias', 'ip', 'username'],
      optional: ['port', 'password', 'key-path', 'tags', 'agent-notes']
    })
    return {
      name: 'hosts-create',
      ...parsed.common,
      host: {
        alias: parsed.flags.alias,
        ip: parsed.flags.ip,
        port: parsed.flags.port ? parseIntOption(parsed.flags.port, '--port') : 22,
        username: parsed.flags.username,
        password: parsed.flags.password,
        keyPath: parsed.flags['key-path'],
        tags: splitList(parsed.flags.tags),
        agentNotes: parsed.flags['agent-notes']
      }
    }
  }
  if (subcommand === 'delete') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'hosts-delete', ...parsed.common, id: parsed.values.id }
  }
  throw usage(`Unknown hosts subcommand: ${subcommand}`)
}

function parseFullTopicsArgs(argv: string[]): FullCliCommand {
  const [subcommand, ...rest] = argv
  if (subcommand === 'create') {
    const parsed = parseFlags(rest, { optional: ['title', 'host'], multi: ['host'] })
    const title = parsed.positionals.join(' ') || parsed.flags.title
    if (!title) throw usage('topics create requires <title> or --title <title>')
    return {
      name: 'topics-create',
      ...parsed.common,
      title,
      hostIds: parsed.multi.host.length > 0 ? parsed.multi.host : ['local']
    }
  }
  if (subcommand === 'rename') {
    const parsed = parsePositionals(rest, ['id', 'title'], { joinRestAt: 'title' })
    return {
      name: 'topics-rename',
      ...parsed.common,
      id: parsed.values.id,
      title: parsed.values.title
    }
  }
  if (subcommand === 'delete') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'topics-delete', ...parsed.common, id: parsed.values.id }
  }
  if (subcommand === 'model') {
    const [action, ...modelRest] = rest
    if (action !== 'set') throw usage(`Unknown topics model subcommand: ${action ?? ''}`)
    const parsed = parseFlags(modelRest, { required: ['provider', 'model'] })
    const topicId = parsed.positionals[0]
    if (!topicId) throw usage('topics model set requires <topic>')
    return {
      name: 'topics-model-set',
      ...parsed.common,
      id: topicId,
      providerId: parsed.flags.provider,
      modelId: parsed.flags.model
    }
  }
  if (subcommand === 'hosts') {
    const [action = 'list', ...hostRest] = rest
    if (action === 'list') {
      const parsed = parsePositionals(hostRest, ['topicId'])
      return { name: 'topics-hosts-list', ...parsed.common, topicId: parsed.values.topicId }
    }
    if (action === 'add' || action === 'remove') {
      const parsed = parsePositionals(hostRest, ['topicId', 'hostId'])
      return {
        name: `topics-hosts-${action}`,
        ...parsed.common,
        topicId: parsed.values.topicId,
        hostId: parsed.values.hostId
      }
    }
    if (action === 'set') {
      const parsed = parseFlags(hostRest, { optional: ['host'], multi: ['host'] })
      const topicId = parsed.positionals[0]
      if (!topicId) throw usage('topics hosts set requires <topic>')
      const hostIds = parsed.multi.host.length > 0 ? parsed.multi.host : parsed.positionals.slice(1)
      return { name: 'topics-hosts-set', ...parsed.common, topicId, hostIds }
    }
    throw usage(`Unknown topics hosts subcommand: ${action}`)
  }
  throw usage(`Unknown topics subcommand: ${subcommand ?? ''}`)
}

function parseChatWatchArgs(argv: string[]): FullCliCommand {
  const [subcommand, ...rest] = argv
  if (subcommand !== 'watch') throw usage(`Unknown chat subcommand: ${subcommand ?? ''}`)
  const parsed = parseFlags(rest, { optional: ['topic', 'interval-ms'] })
  return {
    name: 'chat-watch',
    ...parsed.common,
    topicId: parsed.flags.topic ?? parsed.positionals[0] ?? 'latest',
    intervalMs: parsed.flags['interval-ms']
      ? parseIntOption(parsed.flags['interval-ms'], '--interval-ms')
      : 1000
  }
}

function parseRunsArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['topic', 'task', 'status', 'limit'] })
    return {
      name: 'runs-list',
      ...parsed.common,
      ...parsed.flags,
      limit: parseLimit(parsed.flags.limit, 20)
    }
  }
  if (
    subcommand === 'show' ||
    subcommand === 'parts' ||
    subcommand === 'cancel' ||
    subcommand === 'resume' ||
    subcommand === 'watch'
  ) {
    const parsed = parsePositionals(rest, ['id'])
    return { name: `runs-${subcommand}`, ...parsed.common, id: parsed.values.id }
  }
  throw usage(`Unknown runs subcommand: ${subcommand}`)
}

function parseApprovalsArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['task', 'status', 'limit'] })
    return {
      name: 'approvals-list',
      ...parsed.common,
      ...parsed.flags,
      limit: parseLimit(parsed.flags.limit, 50)
    }
  }
  if (subcommand === 'show') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'approvals-show', ...parsed.common, id: parsed.values.id }
  }
  if (subcommand === 'approve' || subcommand === 'reject') {
    const parsed = parseFlags(rest)
    const id = parsed.positionals[0]
    if (!id) throw usage(`approvals ${subcommand} requires <id>`)
    return {
      name: `approvals-${subcommand}`,
      ...parsed.common,
      id,
      alwaysAllow: parsed.booleans.has('always-allow')
    }
  }
  throw usage(`Unknown approvals subcommand: ${subcommand}`)
}

function parseTasksArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['topic', 'status', 'limit'] })
    return {
      name: 'tasks-list',
      ...parsed.common,
      ...parsed.flags,
      limit: parseLimit(parsed.flags.limit, 20)
    }
  }
  if (subcommand === 'show' || subcommand === 'steps') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: `tasks-${subcommand}`, ...parsed.common, id: parsed.values.id }
  }
  throw usage(`Unknown tasks subcommand: ${subcommand}`)
}

function parseArtifactsArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['task', 'limit'] })
    return {
      name: 'artifacts-list',
      ...parsed.common,
      ...parsed.flags,
      limit: parseLimit(parsed.flags.limit, 50)
    }
  }
  if (subcommand === 'show') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'artifacts-show', ...parsed.common, id: parsed.values.id }
  }
  if (subcommand === 'export') {
    const parsed = parseFlags(rest, { required: ['out'] })
    const id = parsed.positionals[0]
    if (!id) throw usage('artifacts export requires <id>')
    return { name: 'artifacts-export', ...parsed.common, id, out: parsed.flags.out }
  }
  throw usage(`Unknown artifacts subcommand: ${subcommand}`)
}

function parseFullTerminalArgs(argv: string[]): FullCliCommand {
  const [subcommand, ...rest] = argv
  if (subcommand === 'open') {
    const parsed = parseFlags(rest, { optional: ['topic', 'host', 'name', 'role'] })
    return {
      name: 'terminal-open',
      ...parsed.common,
      topicId: parsed.flags.topic ?? 'latest',
      hostId: parsed.flags.host ?? 'local',
      terminalName: parsed.flags.name,
      role: parsed.flags.role ?? 'user'
    }
  }
  if (subcommand === 'input') {
    const parsed = parseFlags(rest, { optional: ['topic'] })
    const sessionId = parsed.positionals[0]
    const data = parsed.positionals.slice(1).join(' ')
    if (!sessionId || !data) throw usage('terminal input requires <session> <data>')
    return {
      name: 'terminal-input',
      ...parsed.common,
      sessionId,
      data,
      topicId: parsed.flags.topic
    }
  }
  if (subcommand === 'resize') {
    const parsed = parseFlags(rest, { required: ['cols', 'rows'] })
    const sessionId = parsed.positionals[0]
    if (!sessionId) throw usage('terminal resize requires <session>')
    return {
      name: 'terminal-resize',
      ...parsed.common,
      sessionId,
      cols: parseIntOption(parsed.flags.cols, '--cols'),
      rows: parseIntOption(parsed.flags.rows, '--rows')
    }
  }
  if (subcommand === 'attach' || subcommand === 'close') {
    const parsed = parsePositionals(rest, ['sessionId'])
    return { name: `terminal-${subcommand}`, ...parsed.common, sessionId: parsed.values.sessionId }
  }
  if (subcommand === 'rename') {
    const parsed = parsePositionals(rest, ['sessionId', 'terminalName'], {
      joinRestAt: 'terminalName'
    })
    return {
      name: 'terminal-rename',
      ...parsed.common,
      sessionId: parsed.values.sessionId,
      terminalName: parsed.values.terminalName
    }
  }
  if (subcommand === 'pin') {
    const parsed = parseFlags(rest)
    const sessionId = parsed.positionals[0]
    if (!sessionId) throw usage('terminal pin requires <session>')
    return {
      name: 'terminal-pin',
      ...parsed.common,
      sessionId,
      isPinned: !parsed.booleans.has('off')
    }
  }
  if (subcommand === 'pause') {
    const parsed = parseFlags(rest)
    const sessionId = parsed.positionals[0]
    if (!sessionId) throw usage('terminal pause requires <session>')
    return {
      name: 'terminal-pause',
      ...parsed.common,
      sessionId,
      paused: !parsed.booleans.has('resume')
    }
  }
  if (subcommand === 'execute') {
    const parsed = parseFlags(rest, { optional: ['topic', 'task', 'step', 'timeout-ms'] })
    const sessionId = parsed.positionals[0]
    const shellCommand = parsed.positionals.slice(1).join(' ')
    if (!sessionId || !shellCommand) throw usage('terminal execute requires <session> <command>')
    return {
      name: 'terminal-execute',
      ...parsed.common,
      sessionId,
      command: shellCommand,
      topicId: parsed.flags.topic,
      taskId: parsed.flags.task,
      stepId: parsed.flags.step,
      timeoutMs: parsed.flags['timeout-ms']
        ? parseIntOption(parsed.flags['timeout-ms'], '--timeout-ms')
        : typeof parsed.common.timeoutMs === 'number'
          ? parsed.common.timeoutMs
          : undefined
    }
  }
  throw usage(`Unknown terminal subcommand: ${subcommand ?? ''}`)
}

function parseFilesArgs(argv: string[]): FullCliCommand {
  const [scope, action = 'ls', ...rest] = argv
  if (scope === 'local') {
    if (action === 'ls') return parseFilePathCommand('files-local-ls', rest, 'path', '.')
    if (action === 'mkdir' || action === 'rm')
      return parseFilePathCommand(`files-local-${action}`, rest, 'path')
    if (action === 'upload' || action === 'download')
      return parseCopyCommand(`files-local-${action}`, rest)
  }
  if (scope === 'sftp') {
    if (action === 'connect') {
      const parsed = parsePositionals(rest, ['hostId'])
      return { name: 'files-sftp-connect', ...parsed.common, hostId: parsed.values.hostId }
    }
    if (action === 'ls') {
      const parsed = parseFlags(rest, { required: ['session'], optional: ['path'] })
      return {
        name: 'files-sftp-ls',
        ...parsed.common,
        sessionId: parsed.flags.session,
        path: parsed.flags.path ?? parsed.positionals[0] ?? '.'
      }
    }
    if (action === 'upload' || action === 'download')
      return parseRemoteCopyCommand(`files-sftp-${action}`, rest)
    if (action === 'mkdir' || action === 'rm') {
      const parsed = parseFlags(rest, { required: ['session'] })
      const filePath = parsed.positionals[0]
      if (!filePath) throw usage(`files sftp ${action} requires <path>`)
      return {
        name: `files-sftp-${action}`,
        ...parsed.common,
        sessionId: parsed.flags.session,
        path: filePath
      }
    }
    if (action === 'close') {
      const parsed = parsePositionals(rest, ['sessionId'])
      return { name: 'files-sftp-close', ...parsed.common, sessionId: parsed.values.sessionId }
    }
  }
  if (scope === 'transfer') {
    if (action === 'start') {
      const parsed = parseFlags(rest, { required: ['from-host', 'from', 'to-host', 'to'] })
      return {
        name: 'files-transfer-start',
        ...parsed.common,
        transferId: parsed.flags.id ?? uuidv4(),
        sourceHostId: parsed.flags['from-host'],
        sourcePath: parsed.flags.from,
        destHostId: parsed.flags['to-host'],
        destPath: parsed.flags.to
      }
    }
    if (action === 'watch')
      return {
        name: 'files-transfer-watch',
        ...parseCommon(rest),
        transferId: rest.find((arg) => !arg.startsWith('--'))
      }
  }
  throw usage(`Unknown files command: ${argv.join(' ')}`)
}

function parsePortForwardArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['host'] })
    return { name: 'pf-list', ...parsed.common, hostId: parsed.flags.host }
  }
  if (subcommand === 'create') {
    const parsed = parseFlags(rest, {
      required: ['host', 'local-port', 'remote-host', 'remote-port']
    })
    return {
      name: 'pf-create',
      ...parsed.common,
      hostId: parsed.flags.host,
      localPort: parseIntOption(parsed.flags['local-port'], '--local-port'),
      remoteHost: parsed.flags['remote-host'],
      remotePort: parseIntOption(parsed.flags['remote-port'], '--remote-port')
    }
  }
  if (subcommand === 'close') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'pf-close', ...parsed.common, id: parsed.values.id }
  }
  throw usage(`Unknown pf subcommand: ${subcommand}`)
}

function parseSettingsArgs(argv: string[]): FullCliCommand {
  const [scope, action = 'list', ...rest] = argv
  if (scope === 'providers') return parseProviderSettings(action, rest)
  if (scope === 'models') return parseModelSettings(action, rest)
  if (scope === 'permissions') return parsePermissionSettings(action, rest)
  if (scope === 'model-settings') return parseLegacyModelSettings(action, rest)
  throw usage(`Unknown settings scope: ${scope ?? ''}`)
}

function parseProviderSettings(action: string, rest: string[]): FullCliCommand {
  if (action === 'list') return { name: 'settings-providers-list', ...parseCommon(rest) }
  if (action === 'show') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'settings-providers-show', ...parsed.common, id: parsed.values.id }
  }
  if (action === 'save') {
    const parsed = parseFlags(rest, {
      optional: [
        'input-json',
        'id',
        'name',
        'type',
        'api-key',
        'api-host',
        'api-version',
        'config-json'
      ]
    })
    return {
      name: 'settings-providers-save',
      ...parsed.common,
      provider: buildProviderInput(parsed)
    }
  }
  if (action === 'delete') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'settings-providers-delete', ...parsed.common, id: parsed.values.id }
  }
  if (action === 'test' || action === 'fetch-models') {
    const parsed = parseFlags(rest, { optional: ['id', 'model', 'input-json'] })
    return {
      name: `settings-providers-${action}`,
      ...parsed.common,
      id: parsed.flags.id ?? parsed.positionals[0],
      modelId: parsed.flags.model,
      provider: parsed.flags['input-json'] ? readJson(parsed.flags['input-json']) : undefined
    }
  }
  throw usage(`Unknown settings providers subcommand: ${action}`)
}

function parseModelSettings(action: string, rest: string[]): FullCliCommand {
  if (action === 'list') {
    const parsed = parseFlags(rest, { optional: ['provider'] })
    return { name: 'settings-models-list', ...parsed.common, providerId: parsed.flags.provider }
  }
  if (action === 'show') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'settings-models-show', ...parsed.common, id: parsed.values.id }
  }
  if (action === 'save') {
    const parsed = parseFlags(rest, {
      optional: [
        'input-json',
        'id',
        'provider',
        'provider-model',
        'name',
        'group',
        'capability',
        'endpoint-type',
        'pricing-json'
      ],
      multi: ['capability']
    })
    return { name: 'settings-models-save', ...parsed.common, model: buildModelInput(parsed) }
  }
  if (action === 'delete') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'settings-models-delete', ...parsed.common, id: parsed.values.id }
  }
  throw usage(`Unknown settings models subcommand: ${action}`)
}

function parsePermissionSettings(action: string, rest: string[]): FullCliCommand {
  if (action === 'get') return { name: 'settings-permissions-get', ...parseCommon(rest) }
  if (action === 'set') {
    const parsed = parseFlags(rest, {
      optional: ['mode']
    })
    if (!parsed.flags.mode) throw usage('settings permissions set requires --mode')
    return {
      name: 'settings-permissions-set',
      ...parsed.common,
      permissions: {
        permissionMode: normalizeCliPermissionMode(parsed.flags.mode)
      }
    }
  }
  throw usage(`Unknown settings permissions subcommand: ${action}`)
}

function normalizeCliPermissionMode(value: string): PermissionMode {
  if (value === 'default' || value === 'auto_review' || value === 'full_access') return value
  throw usage('settings permissions set --mode must be default, auto_review, or full_access')
}

function parseLegacyModelSettings(action: string, rest: string[]): FullCliCommand {
  if (action === 'get') return { name: 'settings-model-settings-get', ...parseCommon(rest) }
  if (action === 'save') {
    const parsed = parseFlags(rest, { optional: ['api-key', 'base-url', 'model'] })
    if (parsed.booleans.has('exa-api-key')) {
      throw usage('settings model-settings save no longer supports --exa-api-key')
    }
    return {
      name: 'settings-model-settings-save',
      ...parsed.common,
      settings: {
        apiKey: parsed.flags['api-key'],
        baseURL: parsed.flags['base-url'],
        model: parsed.flags.model
      }
    }
  }
  throw usage(`Unknown settings model-settings subcommand: ${action}`)
}

function parseMemoryArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === 'list') {
    const parsed = parseFlags(rest, { optional: ['host', 'topic'] })
    return {
      name: 'memory-list',
      ...parsed.common,
      hostId: parsed.flags.host,
      topicId: parsed.flags.topic,
      includeDisabled: parsed.booleans.has('include-disabled')
    }
  }
  if (subcommand === 'create') {
    const parsed = parseFlags(rest, {
      required: ['type', 'content'],
      optional: ['scope', 'host', 'topic', 'source-task', 'confidence', 'importance']
    })
    return { name: 'memory-create', ...parsed.common, memory: buildMemoryInput(parsed) }
  }
  if (subcommand === 'update') {
    const parsed = parseFlags(rest, {
      optional: ['type', 'scope', 'content', 'importance', 'confidence', 'disabled']
    })
    const id = parsed.positionals[0]
    if (!id) throw usage('memory update requires <id>')
    return { name: 'memory-update', ...parsed.common, id, updates: buildMemoryPatch(parsed) }
  }
  if (subcommand === 'delete') {
    const parsed = parsePositionals(rest, ['id'])
    return { name: 'memory-delete', ...parsed.common, id: parsed.values.id }
  }
  if (subcommand === 'global') return parseGlobalMemoryArgs(rest)
  throw usage(`Unknown memory subcommand: ${subcommand}`)
}

function parseGlobalMemoryArgs(argv: string[]): FullCliCommand {
  const [action = 'get', ...rest] = argv
  if (action === 'get') return { name: 'memory-global-get', ...parseCommon(rest) }
  if (action === 'import') {
    const parsed = parseFlags(rest, { required: ['file'] })
    return { name: 'memory-global-import', ...parsed.common, memory: readJson(parsed.flags.file) }
  }
  if (action === 'clear') return { name: 'memory-global-clear', ...parseCommon(rest) }
  if (action === 'fact') {
    const [factAction, ...factRest] = rest
    if (factAction === 'create') {
      const parsed = parseFlags(factRest, {
        required: ['content'],
        optional: ['category', 'confidence', 'source', 'source-task', 'source-run', 'source-error']
      })
      return {
        name: 'memory-global-fact-create',
        ...parsed.common,
        fact: buildGlobalFactInput(parsed)
      }
    }
    if (factAction === 'update') {
      const parsed = parseFlags(factRest, {
        optional: ['content', 'category', 'confidence', 'source-error']
      })
      const id = parsed.positionals[0]
      if (!id) throw usage('memory global fact update requires <fact-id>')
      return {
        name: 'memory-global-fact-update',
        ...parsed.common,
        id,
        updates: buildGlobalFactPatch(parsed)
      }
    }
    if (factAction === 'delete') {
      const parsed = parsePositionals(factRest, ['id'])
      return { name: 'memory-global-fact-delete', ...parsed.common, id: parsed.values.id }
    }
  }
  throw usage(`Unknown memory global subcommand: ${action}`)
}

function parseHistoryArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'search', ...rest] = argv
  if (subcommand !== 'search') throw usage(`Unknown history subcommand: ${subcommand}`)
  const parsed = parseFlags(rest, { optional: ['limit'] })
  const query = parsed.positionals.join(' ')
  if (!query) throw usage('history search requires <query>')
  return {
    name: 'history-search',
    ...parsed.common,
    query,
    limit: parseLimit(parsed.flags.limit, 20)
  }
}

function parseSessionsArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'recoverable', ...rest] = argv
  if (subcommand === 'recoverable') return { name: 'sessions-recoverable', ...parseCommon(rest) }
  if (subcommand === 'watch') {
    const parsed = parseFlags(rest, { optional: ['interval-ms'] })
    return {
      name: 'sessions-watch',
      ...parsed.common,
      intervalMs: parsed.flags['interval-ms']
        ? parseIntOption(parsed.flags['interval-ms'], '--interval-ms')
        : 1000
    }
  }
  throw usage(`Unknown sessions subcommand: ${subcommand}`)
}

function parseDebugArgs(argv: string[]): FullCliCommand {
  const [subcommand = 'logs', ...rest] = argv
  if (subcommand !== 'logs') throw usage(`Unknown debug subcommand: ${subcommand}`)
  const parsed = parseFlags(rest, { optional: ['level'] })
  return {
    name: 'debug-logs',
    ...parsed.common,
    follow: parsed.booleans.has('follow'),
    level: parsed.flags.level
  }
}

async function executeAppStatus(command: FullCliCommand, io: CliIO): Promise<number> {
  const live = await requestLiveControl('app.status', {}, command.timeoutMs)
  const data = {
    live: live.available,
    socketPath: getCliControlSocketPath(),
    dbPath: resolveDbPath(command.dbPath),
    protocolVersion: 1,
    app: live.data
  }
  writeOutput(
    io,
    command,
    data,
    () =>
      [
        `live=${data.live ? 'yes' : 'no'}`,
        `socket=${data.socketPath}`,
        `db=${data.dbPath}`,
        `protocol=${data.protocolVersion}`
      ].join('\n') + '\n'
  )
  return 0
}

async function executeHostsList(command: FullCliCommand, io: CliIO): Promise<number> {
  const result = await liveOrDb(command, 'hosts.list', {}, () =>
    withDatabase(command.dbPath as string | undefined, (db) =>
      selectRows<HostRow, Host>(db, 'hosts', 'ORDER BY createdAt DESC', mapHostRow)
    )
  )
  writeOutput(io, command, result, () => formatHosts(asArray<Host>(result)))
  return 0
}

async function executeHostsShow(command: FullCliCommand, io: CliIO): Promise<number> {
  const id = requireCommandString(command, 'id')
  const result = await liveOrDb(command, 'hosts.show', { id }, () =>
    withDatabase(command.dbPath as string | undefined, (db) => {
      const row = db.prepare('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined
      return row ? mapHostRow(row) : undefined
    })
  )
  writeOutput(io, command, result, () =>
    result ? formatJsonLine(result as Host) : 'Host not found.\n'
  )
  return result ? 0 : 1
}

async function executeTopicHostsList(command: FullCliCommand, io: CliIO): Promise<number> {
  const topicId = requireCommandString(command, 'topicId')
  const result = await liveOrDb(command, 'topics.hosts.list', { topicId }, () =>
    withDatabase(command.dbPath as string | undefined, (db) => {
      const topic = getTopicById(db, resolveRequiredTopicId(db, topicId))
      if (!topic) return []
      return topic.hostIds
        .map(
          (hostId) =>
            db.prepare('SELECT * FROM hosts WHERE id = ?').get(hostId) as HostRow | undefined
        )
        .filter((row): row is HostRow => Boolean(row))
        .map(mapHostRow)
    })
  )
  writeOutput(io, command, result, () => formatHosts(asArray<Host>(result)))
  return 0
}

async function executeRunsList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'runs list reads the database run index')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (command.task) {
      where.push('taskId = ?')
      params.push(resolveRequiredTaskId(db, String(command.task)))
    }
    if (command.topic) {
      where.push('topicId = ?')
      params.push(resolveRequiredTopicId(db, String(command.topic)))
    }
    if (command.status) {
      where.push('status = ?')
      params.push(command.status)
    }
    params.push(command.limit ?? 20)
    const rows = db
      .prepare(
        `SELECT * FROM agent_runs WHERE ${where.join(' AND ')} ORDER BY updatedAt DESC LIMIT ?`
      )
      .all(...params) as AgentRunRow[]
    return rows.map(mapAgentRunRow)
  })
  writeOutput(io, command, result, () => formatRuns(result))
  return 0
}

async function executeRunsShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'runs show reads a database run snapshot')
  const result = withDatabase(command.dbPath as string | undefined, (db) =>
    getRunById(db, resolveRequiredRunId(db, requireCommandString(command, 'id')))
  )
  writeOutput(io, command, result, () => (result ? formatJsonLine(result) : 'Run not found.\n'))
  return result ? 0 : 1
}

async function executeRunParts(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'runs parts reads the database run timeline')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const runId = resolveRequiredRunId(db, requireCommandString(command, 'id'))
    const rows = db
      .prepare('SELECT * FROM agent_parts WHERE runId = ? ORDER BY orderIndex ASC, createdAt ASC')
      .all(runId) as AgentPartRow[]
    return rows.map(mapAgentPartRow)
  })
  writeOutput(io, command, result, () => formatParts(result))
  return 0
}

async function executeApprovalsList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'approvals list reads database approval records')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (command.task) {
      where.push('taskId = ?')
      params.push(resolveRequiredTaskId(db, String(command.task)))
    }
    if (command.status) {
      where.push('status = ?')
      params.push(command.status)
    }
    params.push(command.limit ?? 50)
    const rows = db
      .prepare(
        `SELECT * FROM approvals WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`
      )
      .all(...params) as ApprovalRow[]
    return rows.map(mapApprovalRow)
  })
  writeOutput(io, command, result, () => formatApprovals(result))
  return 0
}

async function executeApprovalsShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'approvals show reads a database approval record')
  const result = withDatabase(command.dbPath as string | undefined, (db) =>
    getApprovalById(db, requireCommandString(command, 'id'))
  )
  writeOutput(io, command, result, () =>
    result ? formatJsonLine(result) : 'Approval not found.\n'
  )
  return result ? 0 : 1
}

async function executeTasksList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'tasks list reads legacy task records from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (command.topic) {
      where.push('topicId = ?')
      params.push(resolveRequiredTopicId(db, String(command.topic)))
    }
    if (command.status) {
      where.push('status = ?')
      params.push(command.status)
    }
    params.push(command.limit ?? 20)
    const rows = db
      .prepare(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY updatedAt DESC LIMIT ?`)
      .all(...params) as TaskRow[]
    return rows.map(mapTaskRow)
  })
  writeOutput(io, command, result, () => formatTasks(result))
  return 0
}

async function executeTasksShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'tasks show reads a legacy task record from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) =>
    getTaskById(db, resolveRequiredTaskId(db, requireCommandString(command, 'id')))
  )
  writeOutput(io, command, result, () => (result ? formatJsonLine(result) : 'Task not found.\n'))
  return result ? 0 : 1
}

async function executeTaskSteps(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'tasks steps reads legacy TaskStep compatibility data')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const taskId = resolveRequiredTaskId(db, requireCommandString(command, 'id'))
    const rows = db
      .prepare('SELECT * FROM task_steps WHERE taskId = ? ORDER BY createdAt ASC')
      .all(taskId) as TaskStepRow[]
    return rows.map(mapTaskStepRow)
  })
  writeOutput(io, command, result, () => formatSteps(result))
  return 0
}

async function executeArtifactsList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'artifacts list reads artifact records from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (command.task) {
      where.push('taskId = ?')
      params.push(resolveRequiredTaskId(db, String(command.task)))
    }
    params.push(command.limit ?? 50)
    const rows = db
      .prepare(
        `SELECT * FROM artifacts WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`
      )
      .all(...params) as ArtifactRow[]
    return rows.map(mapArtifactRow)
  })
  writeOutput(io, command, result, () => formatArtifacts(result))
  return 0
}

async function executeArtifactsShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'artifacts show reads an artifact record from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) =>
    getArtifactById(db, requireCommandString(command, 'id'))
  )
  writeOutput(io, command, result, () =>
    result ? formatArtifact(result) : 'Artifact not found.\n'
  )
  return result ? 0 : 1
}

async function executeArtifactsExport(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'artifacts export reads an artifact from the database before writing a file')
  const artifact = withDatabase(command.dbPath as string | undefined, (db) =>
    getArtifactById(db, requireCommandString(command, 'id'))
  )
  if (!artifact) {
    io.stderr.write('Artifact not found.\n')
    return 1
  }
  const out = path.resolve(expandHome(requireCommandString(command, 'out')))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, artifact.content)
  writeOutput(io, command, { artifact, out }, () => `Exported ${artifact.id} to ${out}\n`)
  return 0
}

async function executeLocalFileCommand(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'files local runs in the CLI process, not through the app runtime')
  const fsPromises = fs.promises
  if (command.name === 'files-local-ls') {
    const dir = path.resolve(expandHome(String(command.path ?? '.')))
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })
    const result = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name)
        const stat = await fsPromises.stat(fullPath)
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stat.size,
          modifyTime: stat.mtimeMs,
          permissions: stat.mode
        }
      })
    )
    writeOutput(io, command, result, () => formatFileEntries(result))
    return 0
  }
  if (command.name === 'files-local-mkdir') {
    await fsPromises.mkdir(path.resolve(expandHome(requireCommandString(command, 'path'))), {
      recursive: true
    })
  } else if (command.name === 'files-local-rm') {
    await fsPromises.rm(path.resolve(expandHome(requireCommandString(command, 'path'))), {
      recursive: true,
      force: false
    })
  } else {
    await fsPromises.copyFile(
      path.resolve(expandHome(requireCommandString(command, 'source'))),
      path.resolve(expandHome(requireCommandString(command, 'dest')))
    )
  }
  writeOutput(io, command, { ok: true }, () => 'ok\n')
  return 0
}

async function executeProvidersList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings providers list reads provider records from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) =>
    selectRows<ProviderRow, Provider>(db, 'providers', 'ORDER BY createdAt DESC', mapProviderRow)
  )
  writeOutput(io, command, result, () => formatProviders(result))
  return 0
}

async function executeProvidersShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings providers show reads a provider record from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const row = db
      .prepare('SELECT * FROM providers WHERE id = ?')
      .get(requireCommandString(command, 'id')) as ProviderRow | undefined
    return row ? mapProviderRow(row) : undefined
  })
  writeOutput(io, command, result, () =>
    result ? formatJsonLine(result) : 'Provider not found.\n'
  )
  return result ? 0 : 1
}

async function executeModelsList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings models list reads model records from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const providerId = command.providerId ? String(command.providerId) : undefined
    const rows = providerId
      ? (db
          .prepare('SELECT * FROM models WHERE providerId = ? ORDER BY createdAt DESC')
          .all(providerId) as ModelRow[])
      : (db.prepare('SELECT * FROM models ORDER BY createdAt DESC').all() as ModelRow[])
    return rows.map(mapModelRow)
  })
  writeOutput(io, command, result, () => formatModels(result))
  return 0
}

async function executeModelsShow(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings models show reads a model record from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const row = db
      .prepare('SELECT * FROM models WHERE id = ?')
      .get(requireCommandString(command, 'id')) as ModelRow | undefined
    return row ? mapModelRow(row) : undefined
  })
  writeOutput(io, command, result, () => (result ? formatJsonLine(result) : 'Model not found.\n'))
  return result ? 0 : 1
}

async function executePermissionsGet(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings permissions get reads permission settings from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const row = db.prepare("SELECT * FROM permissions WHERE id = 'default'").get() as
      | {
          permissionMode?: string | null
          requireConfirmation?: number | null
          autoExecuteSafeOperations?: number | null
          updatedAt: number
        }
      | undefined
    return row ? mapPermissionSettings(row) : defaultPermissionSettings()
  })
  writeOutput(io, command, result, () => formatJsonLine(result))
  return 0
}

function mapPermissionSettings(row: {
  permissionMode?: string | null
  requireConfirmation?: number | null
  autoExecuteSafeOperations?: number | null
  updatedAt: number
}): PermissionSettings {
  const permissionMode = normalizeStoredPermissionMode(
    row.permissionMode,
    typeof row.requireConfirmation === 'number' && typeof row.autoExecuteSafeOperations === 'number'
      ? {
          requireConfirmation: row.requireConfirmation === 1,
          autoExecuteSafeOperations: row.autoExecuteSafeOperations === 1
        }
      : undefined
  )
  return {
    permissionMode,
    updatedAt: row.updatedAt
  }
}

function defaultPermissionSettings(): PermissionSettings {
  return {
    permissionMode: 'default',
    updatedAt: 0
  }
}

function normalizeStoredPermissionMode(
  value: string | null | undefined,
  fallback?: { requireConfirmation: boolean; autoExecuteSafeOperations: boolean }
): PermissionMode {
  if (value === 'default' || value === 'auto_review' || value === 'full_access') return value
  if (!fallback) return 'default'
  if (!fallback.requireConfirmation) return 'full_access'
  if (fallback.autoExecuteSafeOperations) return 'auto_review'
  return 'default'
}

async function executeModelSettingsGet(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'settings model-settings get reads legacy settings from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const row = db.prepare("SELECT * FROM model_settings WHERE id = 'default'").get()
    return row ?? {}
  })
  writeOutput(io, command, result, () => formatJsonLine(result))
  return 0
}

async function executeMemoryList(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'memory list reads memory records from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (command.hostId) {
      where.push('(hostId = ? OR hostId IS NULL)')
      params.push(command.hostId)
    }
    if (command.topicId) {
      where.push('(topicId = ? OR topicId IS NULL)')
      params.push(resolveRequiredTopicId(db, String(command.topicId)))
    }
    if (!command.includeDisabled) where.push('COALESCE(disabled, 0) = 0')
    const rows = db
      .prepare(
        `SELECT * FROM memories WHERE ${where.join(' AND ')} ORDER BY importance DESC, timestamp DESC`
      )
      .all(...params) as MemoryRow[]
    return rows.map(mapMemoryRow)
  })
  writeOutput(io, command, result, () => formatMemories(result))
  return 0
}

async function executeGlobalMemoryGet(command: FullCliCommand, io: CliIO): Promise<number> {
  rejectLiveOnly(command, 'memory global get reads global memory from the database')
  const result = withDatabase(command.dbPath as string | undefined, (db) => {
    const row = db.prepare("SELECT * FROM global_memory WHERE id = 'default'").get() as
      | { data: string; updatedAt: number }
      | undefined
    return row ? parseJSON(row.data, {}) : { version: '1.0', facts: [] }
  })
  writeOutput(io, command, result, () => formatJsonLine(result))
  return 0
}

async function executeHistorySearch(command: FullCliCommand, io: CliIO): Promise<number> {
  const result = await liveOrDb(command, 'history.search', pick(command, 'query', 'limit'), () =>
    withDatabase(command.dbPath as string | undefined, (db) => {
      const rows = db
        .prepare(
          `SELECT DISTINCT content, source, hostId, timestamp FROM terminal_io
           WHERE type = 'input' AND content LIKE ?
           ORDER BY timestamp DESC LIMIT ?`
        )
        .all(`%${String(command.query)}%`, command.limit ?? 20)
      return rows
    })
  )
  writeOutput(io, command, result, () => formatJsonLine(result))
  return 0
}

async function executeRecoverableSessions(command: FullCliCommand, io: CliIO): Promise<number> {
  const result = await liveOrDb(command, 'sessions.recoverable', {}, () =>
    withDatabase(command.dbPath as string | undefined, (db) => {
      const rows = db
        .prepare(
          "SELECT * FROM terminal_sessions WHERE status = 'active' AND isDeleted = 0 ORDER BY createdAt DESC"
        )
        .all() as TerminalSessionRow[]
      return rows.map(mapTerminalSessionRow)
    })
  )
  writeOutput(io, command, result, () => formatTerminalSessions(asArray<TerminalSession>(result)))
  return 0
}

async function executeDebugLogs(command: FullCliCommand, io: CliIO): Promise<number> {
  if (!command.follow) {
    writeOutput(
      io,
      command,
      { message: 'Use --follow to stream live debug logs.' },
      () => 'Use --follow to stream live debug logs.\n'
    )
    return 0
  }
  const code = await requestLiveStream(
    'debug.logs.follow',
    pick(command, 'level'),
    command.timeoutMs as number | undefined,
    io
  )
  return code
}

async function executeLiveRead(
  command: FullCliCommand,
  io: CliIO,
  liveCommand: string,
  args: Record<string, unknown>,
  formatter: (data: unknown) => string
): Promise<number> {
  const live = await requestLiveControl(liveCommand, args, command.timeoutMs as number | undefined)
  if (!live.available) throw new Error('OpenTerm app runtime is not available.')
  writeOutput(io, command, live.data, () => formatter(live.data))
  return 0
}

async function executeLiveMutation(command: FullCliCommand, io: CliIO): Promise<number> {
  const liveCommand = command.name.replaceAll('-', '.')
  const live = await requestLiveControl(
    liveCommand,
    commandToLiveArgs(command),
    command.timeoutMs as number | undefined
  )
  if (!live.available) throw new Error('OpenTerm app runtime is required for this command.')
  writeOutput(io, command, live.data, () => formatMutationResult(command.name, live.data))
  return 0
}

async function liveOrDb<T>(
  command: FullCliCommand,
  liveCommand: string,
  args: Record<string, unknown>,
  dbFallback: () => T
): Promise<T | unknown> {
  if (!command.dbPath) {
    const live = await requestLiveControl(
      liveCommand,
      args,
      command.timeoutMs as number | undefined
    )
    if (live.available) return live.data
  }
  if (command.liveOnly) throw new Error('OpenTerm app runtime is not available.')
  return dbFallback()
}

async function watchRun(command: FullCliCommand, io: CliIO): Promise<number> {
  const intervalMs = Number(command.intervalMs ?? 1000)
  const timeoutMs = Number(command.timeoutMs ?? 600000)
  const startedAt = Date.now()
  const seenParts = new Set<string>()
  let lastRunStatus = ''

  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = withDatabase(command.dbPath as string | undefined, (db) => {
      const runId =
        command.name === 'chat-watch'
          ? latestRunIdForTopic(db, String(command.topicId ?? 'latest'))
          : resolveRequiredRunId(db, requireCommandString(command, 'id'))
      const run = runId ? getRunById(db, runId) : undefined
      const parts = run
        ? (
            db
              .prepare(
                'SELECT * FROM agent_parts WHERE runId = ? ORDER BY orderIndex ASC, createdAt ASC'
              )
              .all(run.id) as AgentPartRow[]
          ).map(mapAgentPartRow)
        : []
      return { run, parts }
    })

    if (snapshot.run && snapshot.run.status !== lastRunStatus) {
      writeNdjson(io, { type: 'run', data: snapshot.run })
      lastRunStatus = snapshot.run.status
    }
    for (const part of snapshot.parts) {
      if (seenParts.has(part.id)) continue
      seenParts.add(part.id)
      writeNdjson(io, { type: 'part', data: part })
    }
    if (snapshot.run && TERMINAL_STATUSES.has(snapshot.run.status))
      return snapshot.run.status === 'completed' ? 0 : 1
    await delay(intervalMs)
  }
  writeNdjson(io, { type: 'timeout', timeoutMs })
  return 124
}

async function watchRecoverableSessions(command: FullCliCommand, io: CliIO): Promise<number> {
  const intervalMs = Number(command.intervalMs ?? 1000)
  const timeoutMs = Number(command.timeoutMs ?? 600000)
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const sessions = await liveOrDb(command, 'sessions.recoverable', {}, () =>
      withDatabase(command.dbPath as string | undefined, (db) => {
        const rows = db
          .prepare(
            "SELECT * FROM terminal_sessions WHERE status = 'active' AND isDeleted = 0 ORDER BY createdAt DESC"
          )
          .all() as TerminalSessionRow[]
        return rows.map(mapTerminalSessionRow)
      })
    )
    writeNdjson(io, { type: 'recoverable', data: sessions })
    await delay(intervalMs)
  }
  return 0
}

function watchUnsupported(command: FullCliCommand, io: CliIO, message: string): number {
  writeOutput(io, command, { ok: false, message }, () => `${message}\n`)
  return 1
}

function rejectLiveOnly(command: FullCliCommand, reason: string): void {
  if (!command.liveOnly) return
  throw new Error(`--live-only is only supported by live-first read commands. ${reason}.`)
}

function requestLiveControl(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs = 800
): Promise<LiveControlResult> {
  const socketPath = getCliControlSocketPath()
  if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
    return Promise.resolve({ available: false })
  }
  const request: CliControlRequest = { id: uuidv4(), command, args }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let buffer = ''
    let settled = false
    const timeout = setTimeout(() => finish({ available: false }), timeoutMs)
    const finish = (result: LiveControlResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.end()
      resolve(result)
    }
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return
      const response = JSON.parse(buffer.slice(0, newlineIndex)) as CliControlResponse
      if (!response.ok) {
        settled = true
        clearTimeout(timeout)
        socket.end()
        reject(new Error(response.error ?? 'CLI control request failed'))
        return
      }
      finish({ available: true, data: response.data ?? response.result })
    })
    socket.on('error', () => finish({ available: false }))
  })
}

function requestLiveStream(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs = 600000,
  io: CliIO
): Promise<number> {
  const socketPath = getCliControlSocketPath()
  if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
    throw new Error('OpenTerm app runtime is required for streaming commands.')
  }
  const request: CliControlRequest = { id: uuidv4(), command, args }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let buffer = ''
    const timeout = setTimeout(() => {
      socket.end()
      resolve(0)
    }, timeoutMs)
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim()) io.stdout.write(`${line}\n`)
        newlineIndex = buffer.indexOf('\n')
      }
    })
    socket.on('error', reject)
    socket.on('close', () => {
      clearTimeout(timeout)
      resolve(0)
    })
  })
}

function parseCommon(argv: string[]): CommonCliOptions {
  return parseFlags(argv).common
}

function parseFlags(
  argv: string[],
  spec: { required?: string[]; optional?: string[]; multi?: string[] } = {}
): {
  common: CommonCliOptions
  flags: Record<string, string>
  multi: Record<string, string[]>
  booleans: Set<string>
  positionals: string[]
} {
  const flags: Record<string, string> = {}
  const multi: Record<string, string[]> = Object.fromEntries(
    (spec.multi ?? []).map((key) => [key, []])
  )
  const booleans = new Set<string>()
  const positionals: string[] = []
  const common: CommonCliOptions = { outputFormat: 'plain' }
  const valueFlags = new Set([
    ...(spec.required ?? []),
    ...(spec.optional ?? []),
    ...(spec.multi ?? []),
    'db',
    'timeout-ms'
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const key = arg.slice(2)
    if (key === 'json') {
      common.outputFormat = 'json'
      continue
    }
    if (key === 'live-only') {
      common.liveOnly = true
      continue
    }
    if (key === 'db') {
      common.dbPath = requireArgValue(argv, index, arg)
      index += 1
      continue
    }
    if (key === 'timeout-ms') {
      common.timeoutMs = parseIntOption(requireArgValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (valueFlags.has(key)) {
      const value = requireArgValue(argv, index, arg)
      if (key in multi) multi[key].push(value)
      else flags[key] = value
      index += 1
      continue
    }
    booleans.add(key)
  }

  for (const key of spec.required ?? []) {
    if (!flags[key]) throw usage(`Missing --${key}`)
  }
  return { common, flags, multi, booleans, positionals }
}

function parsePositionals(
  argv: string[],
  names: string[],
  options: { joinRestAt?: string } = {}
): { common: CommonCliOptions; values: Record<string, string> } {
  const parsed = parseFlags(argv)
  const values: Record<string, string> = {}
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]
    if (options.joinRestAt === name) {
      values[name] = parsed.positionals.slice(index).join(' ')
    } else {
      values[name] = parsed.positionals[index]
    }
    if (!values[name]) throw usage(`Missing <${name}>`)
  }
  return { common: parsed.common, values }
}

function parseFilePathCommand(
  name: string,
  rest: string[],
  field: string,
  fallback?: string
): FullCliCommand {
  const parsed = parseFlags(rest)
  const value = parsed.positionals[0] ?? fallback
  if (!value) throw usage(`${name.replaceAll('-', ' ')} requires <${field}>`)
  return { name, ...parsed.common, [field]: value }
}

function parseCopyCommand(name: string, rest: string[]): FullCliCommand {
  const parsed = parsePositionals(rest, ['source', 'dest'])
  return { name, ...parsed.common, source: parsed.values.source, dest: parsed.values.dest }
}

function parseRemoteCopyCommand(name: string, rest: string[]): FullCliCommand {
  const parsed = parseFlags(rest, { required: ['session'] })
  const [source, dest] = parsed.positionals
  if (!source || !dest) throw usage(`${name.replaceAll('-', ' ')} requires <source> <dest>`)
  return { name, ...parsed.common, sessionId: parsed.flags.session, source, dest }
}

function buildProviderInput(parsed: ReturnType<typeof parseFlags>): Provider {
  if (parsed.flags['input-json']) return readJson(parsed.flags['input-json']) as Provider
  const id = parsed.flags.id
  const name = parsed.flags.name
  const type = parsed.flags.type
  const apiHost = parsed.flags['api-host']
  if (!id || !name || !type || !apiHost)
    throw usage('settings providers save requires --id --name --type --api-host or --input-json')
  const now = Date.now()
  return {
    id,
    name,
    type: type as Provider['type'],
    apiKey: parsed.flags['api-key'] ?? '',
    apiHost,
    apiVersion: parsed.flags['api-version'],
    enabled: !parsed.booleans.has('disabled'),
    isSystem: parsed.booleans.has('system'),
    config: parsed.flags['config-json'] ? JSON.parse(parsed.flags['config-json']) : undefined,
    createdAt: now,
    updatedAt: now
  }
}

function buildModelInput(parsed: ReturnType<typeof parseFlags>): Model {
  if (parsed.flags['input-json']) return readJson(parsed.flags['input-json']) as Model
  const id = parsed.flags.id
  const providerId = parsed.flags.provider
  const name = parsed.flags.name
  if (!id || !providerId || !name)
    throw usage('settings models save requires --id --provider --name or --input-json')
  return {
    id,
    providerId,
    providerModelId: parsed.flags['provider-model'],
    name,
    group: parsed.flags.group,
    capabilities: parsed.multi.capability as Model['capabilities'],
    endpointType: parsed.flags['endpoint-type'],
    pricing: parsed.flags['pricing-json'] ? JSON.parse(parsed.flags['pricing-json']) : undefined,
    createdAt: Date.now()
  }
}

function buildMemoryInput(parsed: ReturnType<typeof parseFlags>): Partial<MemoryEntry> {
  return {
    type: parsed.flags.type as MemoryEntry['type'],
    scope: parsed.flags.scope as MemoryEntry['scope'] | undefined,
    content: parsed.flags.content,
    hostId: parsed.flags.host,
    topicId: parsed.flags.topic,
    sourceTaskId: parsed.flags['source-task'],
    confidence: parsed.flags.confidence ? Number(parsed.flags.confidence) : undefined,
    importance: parsed.flags.importance ? Number(parsed.flags.importance) : 5
  }
}

function buildMemoryPatch(parsed: ReturnType<typeof parseFlags>): Partial<MemoryEntry> {
  return {
    type: parsed.flags.type as MemoryEntry['type'] | undefined,
    scope: parsed.flags.scope as MemoryEntry['scope'] | undefined,
    content: parsed.flags.content,
    importance: parsed.flags.importance ? Number(parsed.flags.importance) : undefined,
    confidence: parsed.flags.confidence ? Number(parsed.flags.confidence) : undefined,
    disabled: parseOptionalBoolean(parsed.flags.disabled)
  }
}

function buildGlobalFactInput(parsed: ReturnType<typeof parseFlags>): Record<string, unknown> {
  return {
    content: parsed.flags.content,
    category: parsed.flags.category,
    confidence: parsed.flags.confidence ? Number(parsed.flags.confidence) : undefined,
    source: parsed.flags.source,
    sourceTaskId: parsed.flags['source-task'],
    sourceRunId: parsed.flags['source-run'],
    sourceError: parsed.flags['source-error']
  }
}

function buildGlobalFactPatch(parsed: ReturnType<typeof parseFlags>): Record<string, unknown> {
  return {
    content: parsed.flags.content,
    category: parsed.flags.category,
    confidence: parsed.flags.confidence ? Number(parsed.flags.confidence) : undefined,
    sourceError: parsed.flags['source-error']
  }
}

function commandToLiveArgs(command: FullCliCommand): Record<string, unknown> {
  const args: Record<string, unknown> = { ...command }
  delete args.name
  delete args.outputFormat
  delete args.dbPath
  delete args.liveOnly
  return args
}

function pick(command: FullCliCommand, ...keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (command[key] !== undefined) result[key] = command[key]
  }
  return result
}

function withDatabase<T>(dbPath: string | undefined, callback: (db: Database.Database) => T): T {
  const resolvedPath = resolveDbPath(dbPath)
  if (!fs.existsSync(resolvedPath)) throw new Error(`Database file not found: ${resolvedPath}`)
  const db = new Database(resolvedPath, { readonly: true, fileMustExist: true })
  try {
    return callback(db)
  } finally {
    db.close()
  }
}

function selectRows<Row, Value>(
  db: Database.Database,
  table: string,
  suffix: string,
  mapper: (row: Row) => Value
): Value[] {
  if (!hasTable(db, table)) return []
  return (db.prepare(`SELECT * FROM ${table} ${suffix}`).all() as Row[]).map(mapper)
}

function hasTable(db: Database.Database, tableName: string): boolean {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  )
}

function resolveDbPath(dbPath?: string): string {
  if (dbPath) return path.resolve(expandHome(dbPath))
  const candidates = [
    process.env.OPENTERM_DB,
    path.join(process.cwd(), 'openterm.db'),
    platformUserDataDbPath()
  ].filter((candidate): candidate is string => Boolean(candidate))
  const existing =
    candidates.find((candidate) => isNonEmptyFile(expandHome(candidate))) ??
    candidates.find((candidate) => fs.existsSync(expandHome(candidate)))
  return path.resolve(expandHome(existing ?? candidates[0]))
}

function resolveRequiredTopicId(db: Database.Database, topicId: string): string {
  const resolved = resolveTopicId(db, topicId)
  if (!resolved) throw new Error(`Topic not found: ${topicId}`)
  return resolved
}

function resolveTopicId(db: Database.Database, topicId?: string): string | undefined {
  if (!topicId) return undefined
  if (topicId === 'latest') {
    const row = db.prepare('SELECT id FROM topics ORDER BY lastMessageAt DESC LIMIT 1').get() as
      | { id: string }
      | undefined
    return row?.id
  }
  return getTopicById(db, topicId)?.id
}

function getTopicById(db: Database.Database, topicId: string): Topic | undefined {
  const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId) as TopicRow | undefined
  return row ? mapTopicRow(row) : undefined
}

function resolveRequiredTaskId(db: Database.Database, taskId: string): string {
  if (taskId !== 'latest') return taskId
  const row = db.prepare('SELECT id FROM tasks ORDER BY updatedAt DESC LIMIT 1').get() as
    | { id: string }
    | undefined
  if (!row) throw new Error('No task found')
  return row.id
}

function resolveRequiredRunId(db: Database.Database, runId: string): string {
  if (runId !== 'latest') return runId
  const row = db.prepare('SELECT id FROM agent_runs ORDER BY updatedAt DESC LIMIT 1').get() as
    | { id: string }
    | undefined
  if (!row) throw new Error('No run found')
  return row.id
}

function latestRunIdForTopic(db: Database.Database, topicIdInput: string): string | undefined {
  const topicId = resolveTopicId(db, topicIdInput)
  if (!topicId) return undefined
  const row = db
    .prepare('SELECT id FROM agent_runs WHERE topicId = ? ORDER BY updatedAt DESC LIMIT 1')
    .get(topicId) as { id: string } | undefined
  return row?.id
}

function getRunById(db: Database.Database, runId: string): AgentRun | undefined {
  const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as
    | AgentRunRow
    | undefined
  return row ? mapAgentRunRow(row) : undefined
}

function getTaskById(db: Database.Database, taskId: string): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined
  return row ? mapTaskRow(row) : undefined
}

function getApprovalById(db: Database.Database, id: string): Approval | undefined {
  const target =
    id === 'latest'
      ? (db.prepare('SELECT * FROM approvals ORDER BY createdAt DESC LIMIT 1').get() as
          | ApprovalRow
          | undefined)
      : (db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined)
  return target ? mapApprovalRow(target) : undefined
}

function getArtifactById(db: Database.Database, id: string): Artifact | undefined {
  const target =
    id === 'latest'
      ? (db.prepare('SELECT * FROM artifacts ORDER BY createdAt DESC LIMIT 1').get() as
          | ArtifactRow
          | undefined)
      : (db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as ArtifactRow | undefined)
  return target ? mapArtifactRow(target) : undefined
}

function writeOutput(
  io: CliIO,
  command: FullCliCommand,
  data: unknown,
  formatPlain: () => string
): void {
  if (command.outputFormat === 'json')
    io.stdout.write(`${JSON.stringify(redactSecrets(data), null, 2)}\n`)
  else io.stdout.write(formatPlain())
}

function writeNdjson(io: CliIO, data: unknown): void {
  io.stdout.write(`${JSON.stringify(data)}\n`)
}

function formatGeneric(message: string): (data: unknown) => string {
  return () => `${message}\n`
}

function formatMutationResult(name: string, data: unknown): string {
  return `${name}: ok\n${typeof data === 'undefined' ? '' : `${formatJsonLine(data)}`}`
}

function formatJsonLine(data: unknown): string {
  return `${JSON.stringify(redactSecrets(data), null, 2)}\n`
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (typeof value !== 'object' || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    output[key] =
      normalizedKey === 'password' || normalizedKey.endsWith('apikey')
        ? child
          ? '[redacted]'
          : child
        : redactSecrets(child)
  }
  return output
}

function formatHosts(hosts: Host[]): string {
  if (hosts.length === 0) return 'No hosts found.\n'
  return (
    hosts
      .map((host) => `${host.id}  ${host.alias}  ${host.username}@${host.ip}:${host.port}`)
      .join('\n') + '\n'
  )
}

function formatRuns(runs: AgentRun[]): string {
  if (runs.length === 0) return 'No runs found.\n'
  return (
    runs
      .map(
        (run) =>
          `${run.id}  ${run.status}  task=${run.taskId} topic=${run.topicId} agent=${run.agentName}`
      )
      .join('\n') + '\n'
  )
}

function formatParts(parts: AgentPart[]): string {
  if (parts.length === 0) return 'No parts found.\n'
  return (
    parts
      .map(
        (part) =>
          `${part.id}  ${part.status}  ${part.type}  ${part.toolName ?? ''} ${truncate(part.output ?? part.input ?? part.error ?? '', 120)}`
      )
      .join('\n') + '\n'
  )
}

function formatApprovals(approvals: Approval[]): string {
  if (approvals.length === 0) return 'No approvals found.\n'
  return (
    approvals
      .map(
        (approval) =>
          `${approval.id}  ${approval.status}  risk=${approval.riskLevel}  ${truncate(approval.command, 120)}`
      )
      .join('\n') + '\n'
  )
}

function formatTasks(tasks: Task[]): string {
  if (tasks.length === 0) return 'No tasks found.\n'
  return (
    tasks
      .map((task) => `${task.id}  ${task.status}  topic=${task.topicId}  ${task.title}`)
      .join('\n') + '\n'
  )
}

function formatSteps(steps: TaskStep[]): string {
  const header = 'Legacy task steps view. New runtime details live in agent run parts.\n'
  if (steps.length === 0) return `${header}No task steps found.\n`
  return (
    header +
    steps
      .map(
        (step) =>
          `${step.id}  ${step.status}  ${step.type}  ${truncate(step.title ?? step.content, 140)}`
      )
      .join('\n') + '\n'
  )
}

function formatArtifacts(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return 'No artifacts found.\n'
  return (
    artifacts
      .map(
        (artifact) => `${artifact.id}  ${artifact.type}  task=${artifact.taskId}  ${artifact.title}`
      )
      .join('\n') + '\n'
  )
}

function formatArtifact(artifact: Artifact): string {
  return `Artifact: ${artifact.title}\nID: ${artifact.id}\nType: ${artifact.type}\nTask: ${artifact.taskId}\n\n${artifact.content}\n`
}

function formatTerminalSessions(sessions: TerminalSession[]): string {
  if (sessions.length === 0) return 'No terminal sessions found.\n'
  return (
    sessions
      .map(
        (session) =>
          `${session.id}  ${session.status}  topic=${session.topicId} host=${session.hostId} name=${session.name ?? '-'}`
      )
      .join('\n') + '\n'
  )
}

function formatFileEntries(entries: unknown): string {
  const list = asArray<Record<string, unknown>>(entries)
  if (list.length === 0) return 'No files found.\n'
  return (
    list
      .map((entry) => `${entry.type ?? '-'}\t${entry.size ?? '-'}\t${entry.name ?? '-'}`)
      .join('\n') + '\n'
  )
}

function formatPortForwards(data: unknown): string {
  const list = asArray<Record<string, unknown>>(data)
  if (list.length === 0) return 'No port forwards found.\n'
  return (
    list
      .map(
        (pf) =>
          `${pf.id}  ${pf.status}  127.0.0.1:${pf.localPort} -> ${pf.remoteHost}:${pf.remotePort} host=${pf.hostId}`
      )
      .join('\n') + '\n'
  )
}

function formatProviders(providers: Provider[]): string {
  if (providers.length === 0) return 'No providers found.\n'
  return (
    providers
      .map(
        (provider) =>
          `${provider.id}  ${provider.enabled ? 'enabled' : 'disabled'}  ${provider.type}  ${provider.name}`
      )
      .join('\n') + '\n'
  )
}

function formatModels(models: Model[]): string {
  if (models.length === 0) return 'No models found.\n'
  return (
    models.map((model) => `${model.id}  provider=${model.providerId}  ${model.name}`).join('\n') +
    '\n'
  )
}

function formatMemories(memories: MemoryEntry[]): string {
  if (memories.length === 0) return 'No memories found.\n'
  return (
    memories
      .map(
        (memory) =>
          `${memory.id}  ${memory.type}/${memory.scope}  importance=${memory.importance}  ${truncate(memory.content, 140)}`
      )
      .join('\n') + '\n'
  )
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function readJson(filePath: string): unknown {
  const input =
    filePath === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(path.resolve(expandHome(filePath)), 'utf8')
  return JSON.parse(input)
}

function parseLimit(value: string | undefined, fallback: number): number {
  return value ? parseIntOption(value, '--limit') : fallback
}

function parseIntOption(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw usage(`${option} must be an integer`)
  return parsed
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true' || value === '1' || value === 'yes') return true
  if (value === 'false' || value === '0' || value === 'no') return false
  throw usage(`Invalid boolean: ${value}`)
}

function splitList(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

function requireArgValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw usage(`Missing value for ${option}`)
  return value
}

function requireCommandString(command: FullCliCommand, key: string): string {
  const value = command[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${key}`)
  return value
}

function usage(message: string): never {
  throw new FullCliUsageError(message)
}

function isNonEmptyFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size > 0
  } catch {
    return false
  }
}

function platformUserDataDbPath(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'openterm', 'openterm.db')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'openterm', 'openterm.db')
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    'openterm',
    'openterm.db'
  )
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
