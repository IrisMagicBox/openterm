#!/usr/bin/env node
import Database from 'better-sqlite3'
import net from 'node:net'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  buildConversationDiagnostics,
  formatConversationDiagnosticsMarkdown,
  type ConversationDiagnosticTargetKind,
  type ConversationDiagnosticsOptions,
  type ConversationDiagnosticsReport
} from '../main/db/conversation-diagnostics'
import { isBuiltInAgentName } from '../main/agent/agent-config'
import {
  mapMessageRow,
  mapTerminalIORow,
  mapTerminalSessionRow,
  mapTopicRow
} from '../main/db/mappers'
import type { MessageRow, TerminalIORow, TerminalSessionRow, TopicRow } from '../main/db/row-types'
import {
  getCliControlSocketPath,
  type CliControlRequest,
  type CliControlResponse
} from '../main/cli-control-protocol'
import type { Message, TerminalIO, TerminalSession, Topic } from '../shared/types'
import {
  executeFullCliCommand,
  isFullCliCommand,
  parseFullCliArgs,
  type FullCliCommand
} from './full-surface'
import { CLI_TOOL_MANIFEST } from './tool-manifest'

const requireModule = createRequire(import.meta.url)

type OutputFormat = 'plain' | 'json'
type CliCommand =
  | { name: 'help' }
  | FullCliCommand
  | {
      name: 'diagnose'
      targetId: string
      targetKind: ConversationDiagnosticTargetKind
      dbPath?: string
      outputFormat: OutputFormat
      diagnosticsOptions: ConversationDiagnosticsOptions
    }
  | {
      name: 'topics-list'
      dbPath?: string
      limit: number
      outputFormat: OutputFormat
    }
  | {
      name: 'topics-show'
      targetId: string
      dbPath?: string
      outputFormat: OutputFormat
      messageLimit: number
    }
  | {
      name: 'chat-send'
      content: string
      topicId?: string
      createTopic: boolean
      title?: string
      hostIds: string[]
      dbPath?: string
      outputFormat: OutputFormat
      agentName: string
      autoApprove: boolean
      events: boolean
      timeoutMs: number
      keepTerminals: boolean
    }
  | {
      name: 'chat-history'
      topicId: string
      dbPath?: string
      outputFormat: OutputFormat
      limit: number
    }
  | {
      name: 'terminal-list'
      topicId?: string
      dbPath?: string
      outputFormat: OutputFormat
      includeDeleted: boolean
      status?: string
    }
  | {
      name: 'terminal-count'
      topicId?: string
      dbPath?: string
      outputFormat: OutputFormat
      includeDeleted: boolean
      status?: string
    }
  | {
      name: 'terminal-output'
      sessionId: string
      topicId?: string
      dbPath?: string
      outputFormat: OutputFormat
      limit: number
      includeDeleted: boolean
      raw: boolean
    }
  | {
      name: 'run'
      command: string[]
      shellCommand?: string
      cwd?: string
      timeoutMs: number
      outputFormat: OutputFormat
    }
  | {
      name: 'doctor'
      outputFormat: OutputFormat
      timeoutMs: number
      checks: DoctorCheckName[]
    }
  | {
      name: 'tools-list'
      outputFormat: OutputFormat
      category?: string
    }

type DoctorCheckName = 'typecheck' | 'test' | 'lint'

interface CliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>
  stderr: Pick<NodeJS.WriteStream, 'write'>
}

interface RunProcessResult {
  command: string
  args: string[]
  cwd: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  durationMs: number
  stdout: string
  stderr: string
}

interface TopicListRow extends TopicRow {
  messageCount: number
  taskCount: number
  runCount: number
  errorCount: number
}

interface CliWebContentsEvent {
  event: string
  payload: unknown
}

type LiveControlResult = { available: true; result: unknown } | { available: false }

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export async function runCli(argv: string[], io: CliIO = process): Promise<number> {
  try {
    const command = parseCliArgs(argv)
    return await executeCliCommand(command, io)
  } catch (error) {
    if (
      error instanceof CliUsageError ||
      (error instanceof Error && error.name === 'CliUsageError')
    ) {
      io.stderr.write(`opentermctl: ${error.message}\n\n${formatHelp()}\n`)
      return 2
    }

    const message = error instanceof Error ? error.message : String(error)
    io.stderr.write(`opentermctl failed: ${message}\n`)
    return 1
  }
}

export function parseCliArgs(argv: string[]): CliCommand {
  const { argv: normalizedArgv, options: globalOptions } = stripGlobalOptions(argv)
  const [command = 'help', ...rest] = normalizedArgv
  const commandArgs = mergeGlobalOptions(rest, globalOptions)
  if (command === 'help' || command === '--help' || command === '-h') return { name: 'help' }
  const fullCommand = parseFullCliArgs(command, commandArgs)
  if (fullCommand) return fullCommand
  const legacyArgs = mergeGlobalOptions(rest, filterLegacyGlobalOptions(globalOptions, command))
  if (command === 'diag' || command === 'diagnose') return parseDiagnoseArgs(legacyArgs)
  if (command === 'topics' || command === 'topic') return parseTopicsArgs(legacyArgs)
  if (command === 'chat' || command === 'message') return parseChatArgs(legacyArgs)
  if (command === 'terminal' || command === 'term' || command === 'terminals') {
    return parseTerminalArgs(legacyArgs)
  }
  if (command === 'run') return parseRunArgs(legacyArgs)
  if (command === 'doctor') return parseDoctorArgs(legacyArgs)
  if (command === 'tools' || command === 'tool') return parseToolsArgs(legacyArgs)
  throw new CliUsageError(`Unknown command: ${command}`)
}

function stripGlobalOptions(argv: string[]): { argv: string[]; options: string[] } {
  const options: string[] = []
  const rest = [...argv]

  while (rest.length > 0) {
    const arg = rest[0]
    if (arg === '--json' || arg === '--live-only') {
      options.push(arg)
      rest.shift()
      continue
    }
    if (arg === '--db' || arg === '--timeout-ms') {
      const value = rest[1]
      if (!value || value.startsWith('--')) throw new CliUsageError(`Missing value for ${arg}`)
      options.push(arg, value)
      rest.splice(0, 2)
      continue
    }
    break
  }

  return { argv: rest, options }
}

function mergeGlobalOptions(rest: string[], globalOptions: string[]): string[] {
  if (globalOptions.length === 0) return rest
  const separatorIndex = rest.indexOf('--')
  if (separatorIndex === -1) return [...rest, ...globalOptions]
  return [...rest.slice(0, separatorIndex), ...globalOptions, ...rest.slice(separatorIndex)]
}

function filterLegacyGlobalOptions(globalOptions: string[], command: string): string[] {
  const filtered: string[] = []
  for (let index = 0; index < globalOptions.length; index += 1) {
    const option = globalOptions[index]
    if (option === '--live-only') continue
    if (
      option === '--timeout-ms' &&
      command !== 'chat' &&
      command !== 'message' &&
      command !== 'run' &&
      command !== 'doctor'
    ) {
      index += 1
      continue
    }
    filtered.push(option)
    if (option === '--db' || option === '--timeout-ms') {
      filtered.push(globalOptions[index + 1])
      index += 1
    }
  }
  return filtered
}

async function executeCliCommand(command: CliCommand, io: CliIO): Promise<number> {
  const executable = command as never
  switch (command.name) {
    case 'help':
      io.stdout.write(`${formatHelp()}\n`)
      return 0
    case 'diagnose':
      return executeDiagnose(executable, io)
    case 'topics-list':
      return executeTopicsList(executable, io)
    case 'topics-show':
      return executeTopicsShow(executable, io)
    case 'chat-send':
      return executeChatSend(executable, io)
    case 'chat-history':
      return executeChatHistory(executable, io)
    case 'terminal-list':
      return executeTerminalList(executable, io)
    case 'terminal-count':
      return executeTerminalCount(executable, io)
    case 'terminal-output':
      return executeTerminalOutput(executable, io)
    case 'run':
      return executeRun(executable, io)
    case 'doctor':
      return executeDoctor(executable, io)
    case 'tools-list':
      return executeToolsList(executable, io)
    default:
      if (isFullCliCommand(command)) return executeFullCliCommand(command, io)
      throw new CliUsageError(`Unknown command: ${command.name}`)
  }
}

function parseDiagnoseArgs(argv: string[]): CliCommand {
  let targetId = ''
  let targetKind: ConversationDiagnosticTargetKind = 'auto'
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let includeDeleted = false
  let terminalIOLimit = 1000
  let scope: ConversationDiagnosticsOptions['scope'] = 'topic'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { name: 'help' }
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--kind') {
      targetKind = parseTargetKind(requireValue(argv, index, arg))
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg === '--focused') {
      scope = 'focused'
      continue
    }
    if (arg === '--include-deleted') {
      includeDeleted = true
      continue
    }
    if (arg === '--io-limit') {
      terminalIOLimit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown diagnose option: ${arg}`)
    if (targetId) throw new CliUsageError(`Unexpected extra diagnose argument: ${arg}`)
    targetId = arg
  }

  if (!targetId) throw new CliUsageError('diagnose requires <id|latest>')
  return {
    name: 'diagnose',
    targetId,
    targetKind,
    dbPath,
    outputFormat,
    diagnosticsOptions: {
      includeDeleted,
      terminalIOLimit,
      scope
    }
  }
}

function parseTopicsArgs(argv: string[]): CliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === '--help' || subcommand === '-h') return { name: 'help' }
  if (subcommand === 'list') return parseTopicsListArgs(rest)
  if (subcommand === 'show') return parseTopicsShowArgs(rest)
  throw new CliUsageError(`Unknown topics subcommand: ${subcommand}`)
}

function parseTopicsListArgs(argv: string[]): CliCommand {
  let dbPath: string | undefined
  let limit = 20
  let outputFormat: OutputFormat = 'plain'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--limit') {
      limit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    throw new CliUsageError(`Unknown topics list option: ${arg}`)
  }

  return { name: 'topics-list', dbPath, limit, outputFormat }
}

function parseTopicsShowArgs(argv: string[]): CliCommand {
  let targetId = ''
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let messageLimit = 10

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg === '--messages') {
      messageLimit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown topics show option: ${arg}`)
    if (targetId) throw new CliUsageError(`Unexpected extra topics show argument: ${arg}`)
    targetId = arg
  }

  if (!targetId) throw new CliUsageError('topics show requires <id|latest>')
  return { name: 'topics-show', targetId, dbPath, outputFormat, messageLimit }
}

function parseChatArgs(argv: string[]): CliCommand {
  const [subcommand = 'send', ...rest] = argv
  if (subcommand === '--help' || subcommand === '-h') return { name: 'help' }
  if (subcommand === 'send' || subcommand === 'ask') return parseChatSendArgs(rest)
  if (subcommand === 'history' || subcommand === 'messages') return parseChatHistoryArgs(rest)
  throw new CliUsageError(`Unknown chat subcommand: ${subcommand}`)
}

function parseChatSendArgs(argv: string[]): CliCommand {
  let content = ''
  let topicId: string | undefined
  let createTopic = false
  let title: string | undefined
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let agentName = 'build'
  let autoApprove = false
  let events = false
  let timeoutMs = 600000
  let keepTerminals = false
  const hostIds: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--topic') {
      topicId = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--new-topic' || arg === '--new') {
      createTopic = true
      continue
    }
    if (arg === '--title') {
      title = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--host') {
      hostIds.push(requireValue(argv, index, arg))
      index += 1
      continue
    }
    if (arg === '--agent') {
      agentName = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--yes' || arg === '--auto-approve') {
      autoApprove = true
      continue
    }
    if (arg === '--events' || arg === '--watch') {
      events = true
      continue
    }
    if (arg === '--keep-terminals') {
      keepTerminals = true
      continue
    }
    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown chat send option: ${arg}`)
    content = [arg, ...argv.slice(index + 1)].join(' ')
    break
  }

  if (!content.trim()) throw new CliUsageError('chat send requires a message')
  if (topicId && createTopic) throw new CliUsageError('Use either --topic or --new-topic, not both')
  if (!isBuiltInAgentName(agentName)) {
    throw new CliUsageError(`Unknown agent: ${agentName}`)
  }
  return {
    name: 'chat-send',
    content,
    topicId,
    createTopic,
    title,
    hostIds,
    dbPath,
    outputFormat,
    agentName,
    autoApprove,
    events,
    timeoutMs,
    keepTerminals
  }
}

function parseChatHistoryArgs(argv: string[]): CliCommand {
  let topicId = 'latest'
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let limit = 20

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--topic') {
      topicId = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--limit') {
      limit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown chat history option: ${arg}`)
    topicId = arg
  }

  return { name: 'chat-history', topicId, dbPath, outputFormat, limit }
}

function parseTerminalArgs(argv: string[]): CliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === '--help' || subcommand === '-h') return { name: 'help' }
  if (subcommand === 'list' || subcommand === 'sessions') return parseTerminalListArgs(rest)
  if (subcommand === 'count') return parseTerminalCountArgs(rest)
  if (subcommand === 'output' || subcommand === 'show' || subcommand === 'tail') {
    return parseTerminalOutputArgs(rest)
  }
  throw new CliUsageError(`Unknown terminal subcommand: ${subcommand}`)
}

function parseTerminalListArgs(argv: string[]): CliCommand {
  const options = parseTerminalCommonArgs(argv)
  return { name: 'terminal-list', ...options }
}

function parseTerminalCountArgs(argv: string[]): CliCommand {
  const options = parseTerminalCommonArgs(argv)
  return { name: 'terminal-count', ...options }
}

function parseTerminalCommonArgs(argv: string[]): {
  topicId?: string
  dbPath?: string
  outputFormat: OutputFormat
  includeDeleted: boolean
  status?: string
} {
  let topicId: string | undefined
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let includeDeleted = false
  let status: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--topic') {
      topicId = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--status') {
      status = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--active') {
      status = 'active'
      continue
    }
    if (arg === '--all' || arg === '--include-deleted') {
      includeDeleted = true
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown terminal option: ${arg}`)
    topicId = arg
  }

  return { topicId, dbPath, outputFormat, includeDeleted, status }
}

function parseTerminalOutputArgs(argv: string[]): CliCommand {
  let sessionId = ''
  let topicId: string | undefined
  let dbPath: string | undefined
  let outputFormat: OutputFormat = 'plain'
  let limit = 80
  let includeDeleted = false
  let raw = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--db') {
      dbPath = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--topic') {
      topicId = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--limit' || arg === '--tail') {
      limit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--include-deleted') {
      includeDeleted = true
      continue
    }
    if (arg === '--raw') {
      raw = true
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown terminal output option: ${arg}`)
    if (sessionId) throw new CliUsageError(`Unexpected extra terminal output argument: ${arg}`)
    sessionId = arg
  }

  if (!sessionId) sessionId = 'latest'
  return {
    name: 'terminal-output',
    sessionId,
    topicId,
    dbPath,
    outputFormat,
    limit,
    includeDeleted,
    raw
  }
}

function parseRunArgs(argv: string[]): CliCommand {
  let cwd: string | undefined
  let timeoutMs = 120000
  let outputFormat: OutputFormat = 'plain'
  let shellCommand: string | undefined
  const command: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      command.push(...argv.slice(index + 1))
      break
    }
    if (arg === '--cwd') {
      cwd = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg === '--shell') {
      shellCommand = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new CliUsageError(`Unknown run option: ${arg}`)
    command.push(arg, ...argv.slice(index + 1))
    break
  }

  if (!shellCommand && command.length === 0) {
    throw new CliUsageError('run requires -- <command...> or --shell <command>')
  }

  return { name: 'run', command, shellCommand, cwd, timeoutMs, outputFormat }
}

function parseDoctorArgs(argv: string[]): CliCommand {
  let outputFormat: OutputFormat = 'plain'
  let timeoutMs = 300000
  let includeLint = false
  let includeTypecheck = true
  let includeTest = true

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg === '--lint') {
      includeLint = true
      continue
    }
    if (arg === '--no-typecheck') {
      includeTypecheck = false
      continue
    }
    if (arg === '--no-test' || arg === '--no-tests') {
      includeTest = false
      continue
    }
    throw new CliUsageError(`Unknown doctor option: ${arg}`)
  }

  const checks: DoctorCheckName[] = []
  if (includeTypecheck) checks.push('typecheck')
  if (includeTest) checks.push('test')
  if (includeLint) checks.push('lint')
  if (checks.length === 0) throw new CliUsageError('doctor needs at least one enabled check')
  return { name: 'doctor', outputFormat, timeoutMs, checks }
}

function parseToolsArgs(argv: string[]): CliCommand {
  const [subcommand = 'list', ...rest] = argv
  if (subcommand === '--help' || subcommand === '-h') return { name: 'help' }
  if (subcommand !== 'list') throw new CliUsageError(`Unknown tools subcommand: ${subcommand}`)

  let outputFormat: OutputFormat = 'plain'
  let category: string | undefined
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--json') {
      outputFormat = 'json'
      continue
    }
    if (arg === '--category') {
      category = requireValue(rest, index, arg)
      index += 1
      continue
    }
    throw new CliUsageError(`Unknown tools list option: ${arg}`)
  }

  return { name: 'tools-list', outputFormat, category }
}

function executeDiagnose(command: Extract<CliCommand, { name: 'diagnose' }>, io: CliIO): number {
  const report = withDatabase(command.dbPath, (db, resolvedPath) => {
    assertOpenTermSchema(db, resolvedPath)
    return buildConversationDiagnostics(
      db,
      { id: command.targetId, kind: command.targetKind },
      command.diagnosticsOptions
    )
  })
  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    io.stdout.write(`${formatConversationDiagnosticsMarkdown(report)}\n`)
  }
  return report.summary.errorCount > 0 || report.summary.failedCommandCount > 0 ? 1 : 0
}

function executeTopicsList(
  command: Extract<CliCommand, { name: 'topics-list' }>,
  io: CliIO
): number {
  const rows = withDatabase(command.dbPath, (db) => {
    if (!hasTable(db, 'topics')) return []
    return db
      .prepare(
        `
        SELECT
          topics.*,
          (SELECT COUNT(*) FROM messages WHERE messages.topicId = topics.id) AS messageCount,
          (SELECT COUNT(*) FROM tasks WHERE tasks.topicId = topics.id) AS taskCount,
          (SELECT COUNT(*) FROM agent_runs WHERE agent_runs.topicId = topics.id) AS runCount,
          (
            SELECT COUNT(*)
            FROM agent_runs
            WHERE agent_runs.topicId = topics.id AND agent_runs.status IN ('failed', 'cancelled')
          ) + (
            SELECT COUNT(*)
            FROM agent_parts
            WHERE
              agent_parts.status = 'error'
              AND agent_parts.runId IN (
                SELECT agent_runs.id FROM agent_runs WHERE agent_runs.topicId = topics.id
              )
          ) + (
            SELECT COUNT(*)
            FROM task_steps
            WHERE
              task_steps.status = 'failed'
              AND task_steps.taskId IN (
                SELECT tasks.id FROM tasks WHERE tasks.topicId = topics.id
              )
          ) AS errorCount
        FROM topics
        ORDER BY topics.lastMessageAt DESC
        LIMIT ?
      `
      )
      .all(command.limit) as TopicListRow[]
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
    return 0
  }

  if (rows.length === 0) {
    io.stdout.write('No topics found.\n')
    return 0
  }

  io.stdout.write(formatTopicRows(rows))
  return 0
}

function executeTopicsShow(
  command: Extract<CliCommand, { name: 'topics-show' }>,
  io: CliIO
): number {
  const report = withDatabase(command.dbPath, (db, resolvedPath) => {
    assertOpenTermSchema(db, resolvedPath)
    return buildConversationDiagnostics(
      db,
      { id: command.targetId, kind: 'topic' },
      { scope: 'topic' }
    )
  })
  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    io.stdout.write(formatTopicDetail(report, command.messageLimit))
  }
  return report.summary.errorCount > 0 || report.summary.failedCommandCount > 0 ? 1 : 0
}

async function executeChatSend(
  command: Extract<CliCommand, { name: 'chat-send' }>,
  io: CliIO
): Promise<number> {
  if (!command.dbPath && !command.autoApprove) {
    const live = await requestLiveControl(
      'chat.send',
      {
        content: command.content,
        topicId: command.createTopic ? undefined : (command.topicId ?? 'latest'),
        title: command.title,
        hostIds: command.hostIds
      },
      command.timeoutMs + 1000
    )
    if (live.available) {
      if (command.outputFormat === 'json') {
        io.stdout.write(`${JSON.stringify(live.result, null, 2)}\n`)
      } else {
        const message = live.result as Partial<Message>
        io.stdout.write(`${message.content ?? JSON.stringify(live.result)}\n`)
      }
      return 0
    }
  }

  const resolvedDbPath = prepareRuntimeDatabase(command.dbPath)
  const appDb = requireModule('../main/db') as typeof import('../main/db')
  const { AgentRunner } = requireModule(
    '../main/AgentRunner'
  ) as typeof import('../main/AgentRunner')
  const { agentService, setCreateAgentSession } = requireModule(
    '../main/agent'
  ) as typeof import('../main/agent')
  const ssh = requireModule('../main/ssh') as typeof import('../main/ssh')

  ssh.setAgentService(agentService)
  setCreateAgentSession(ssh.createAgentSession)

  const events: CliWebContentsEvent[] = []
  const webContents = createCliWebContents(io, command.events, events)
  agentService.setWebContents(webContents)

  const topic = resolveOrCreateChatTopic(appDb.db, command)
  const selection = await tryResolveProviderSelection(topic.id)
  const task = appDb.taskDB.createTask({
    topicId: topic.id,
    title: command.content.slice(0, 50),
    goal: command.content,
    status: 'running',
    selectedProviderId: selection?.provider.id ?? topic.selectedProviderId,
    selectedModelId: selection?.modelRecordId ?? topic.selectedModelId
  })
  const runId = uuidv4()
  const userMessage: Message = {
    id: uuidv4(),
    topicId: topic.id,
    runId,
    role: 'user',
    content: command.content,
    timestamp: Date.now()
  }
  appDb.messageDB.createMessage(userMessage)

  const abortController = new AbortController()
  const ensuredSessionIds = new Set<string>()
  const sessionKeys = new Map<string, string>()
  const timeout = setTimeout(() => abortController.abort(), command.timeoutMs)

  try {
    const context = {
      topicId: topic.id,
      taskId: task.id,
      runId,
      webContents,
      agentService,
      ensureSession: async (
        hostId: string,
        hostAlias: string,
        name?: string,
        options?: { role?: 'agent_command' | 'interactive' | 'user' }
      ) => {
        const role = options?.role ?? 'agent_command'
        const key = `${hostId}\u0000${name ?? ''}\u0000${role}`
        const existing = sessionKeys.get(key)
        if (existing) return existing

        const session = await agentService.createTerminal(topic.id, hostId, name ?? hostAlias, {
          role
        })
        sessionKeys.set(key, session.id)
        ensuredSessionIds.add(session.id)
        return session.id
      },
      requestAuthorization: async (
        shellCommand: string,
        riskLevel: 'low' | 'medium' | 'high' | 'critical',
        reason: string
      ) => {
        if (command.autoApprove) return { approved: true, alwaysAllow: false }
        io.stderr.write(
          `Permission denied in non-interactive CLI mode: risk=${riskLevel} command=${shellCommand} reason=${reason}\nUse --yes to auto-approve permission prompts.\n`
        )
        return { approved: false, alwaysAllow: false }
      },
      notifyStep: (message: Message) => {
        if (command.events) io.stderr.write(`[agent:step] ${message.content}\n`)
      },
      metadata: () => {},
      abort: abortController.signal
    }

    const runner = new AgentRunner(context, command.agentName, { runId, goal: command.content })
    let result: Message
    try {
      result = await runner.run(appDb.messageDB.getMessages(topic.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorMessage: Message = {
        id: uuidv4(),
        topicId: topic.id,
        runId,
        role: 'assistant',
        content: `抱歉，处理您的请求时出现错误: ${message}`,
        timestamp: Date.now()
      }
      appDb.messageDB.createMessage(errorMessage)
      appDb.taskDB.updateTask(task.id, { status: 'failed', summary: message })

      if (command.outputFormat === 'json') {
        io.stdout.write(
          `${JSON.stringify(
            {
              dbPath: resolvedDbPath,
              topic,
              task: appDb.taskDB.getTaskById(task.id),
              runId,
              message: errorMessage,
              error: message,
              events: command.events ? events : undefined
            },
            null,
            2
          )}\n`
        )
      } else {
        io.stderr.write(`${errorMessage.content}\n`)
        io.stderr.write(`topic=${topic.id} task=${task.id} run=${runId}\n`)
      }
      return 1
    }
    clearTimeout(timeout)

    const payload = {
      dbPath: resolvedDbPath,
      topic,
      task,
      runId,
      message: result,
      events: command.events ? events : undefined
    }
    if (command.outputFormat === 'json') {
      io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    } else {
      io.stdout.write(`${result.content}\n`)
      io.stderr.write(`topic=${topic.id} task=${task.id} run=${runId}\n`)
    }
    return 0
  } finally {
    clearTimeout(timeout)
    if (!command.keepTerminals) {
      for (const sessionId of ensuredSessionIds) {
        await agentService.closeTerminal(sessionId).catch(() => undefined)
      }
    }
  }
}

function executeChatHistory(
  command: Extract<CliCommand, { name: 'chat-history' }>,
  io: CliIO
): number {
  const result = withDatabase(command.dbPath, (db) => {
    if (!hasTable(db, 'messages')) return { topic: undefined, messages: [] }
    const topicId = resolveRequiredTopicId(db, command.topicId)
    const topic = getTopicById(db, topicId)
    const rows = db
      .prepare('SELECT * FROM messages WHERE topicId = ? ORDER BY timestamp DESC LIMIT ?')
      .all(topicId, command.limit) as MessageRow[]
    return { topic, messages: rows.map(mapMessageRow).reverse() }
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (!result.topic) {
    io.stdout.write('No messages found.\n')
  } else {
    io.stdout.write(formatChatHistory(result.topic, result.messages))
  }
  return 0
}

function executeTerminalList(
  command: Extract<CliCommand, { name: 'terminal-list' }>,
  io: CliIO
): number | Promise<number> {
  if (!command.dbPath && !command.includeDeleted) {
    return requestLiveControl('terminal.list', { topicId: command.topicId }).then((live) => {
      if (!live.available) return executeTerminalListFromDb(command, io)
      const sessions = (Array.isArray(live.result) ? live.result : []) as TerminalSession[]
      const filtered = command.status
        ? sessions.filter((session) => session.status === command.status)
        : sessions
      if (command.outputFormat === 'json') {
        io.stdout.write(`${JSON.stringify({ live: true, sessions: filtered }, null, 2)}\n`)
      } else {
        io.stdout.write(formatTerminalSessions(filtered))
      }
      return 0
    })
  }
  return executeTerminalListFromDb(command, io)
}

function executeTerminalListFromDb(
  command: Extract<CliCommand, { name: 'terminal-list' }>,
  io: CliIO
): number {
  const result = withDatabase(command.dbPath, (db) => {
    const sessions = selectTerminalSessions(db, {
      topicId: command.topicId,
      includeDeleted: command.includeDeleted,
      status: command.status
    })
    return { topicId: command.topicId ? resolveTopicId(db, command.topicId) : undefined, sessions }
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    io.stdout.write(formatTerminalSessions(result.sessions))
  }
  return 0
}

function executeTerminalCount(
  command: Extract<CliCommand, { name: 'terminal-count' }>,
  io: CliIO
): number | Promise<number> {
  if (!command.dbPath && !command.includeDeleted) {
    return requestLiveControl('terminal.count', { topicId: command.topicId }).then((live) => {
      if (!live.available) return executeTerminalCountFromDb(command, io)
      const result = live.result as { total?: number; byStatus?: Record<string, number> }
      if (command.outputFormat === 'json') {
        io.stdout.write(`${JSON.stringify({ live: true, ...result }, null, 2)}\n`)
      } else {
        io.stdout.write(`total=${result.total ?? 0}\n`)
        for (const [status, count] of Object.entries(result.byStatus ?? {})) {
          io.stdout.write(`${status}=${count}\n`)
        }
      }
      return 0
    })
  }
  return executeTerminalCountFromDb(command, io)
}

function executeTerminalCountFromDb(
  command: Extract<CliCommand, { name: 'terminal-count' }>,
  io: CliIO
): number {
  const result = withDatabase(command.dbPath, (db) => {
    const sessions = selectTerminalSessions(db, {
      topicId: command.topicId,
      includeDeleted: command.includeDeleted,
      status: command.status
    })
    const byStatus = sessions.reduce<Record<string, number>>((acc, session) => {
      acc[session.status] = (acc[session.status] ?? 0) + 1
      return acc
    }, {})
    return {
      topicId: command.topicId ? resolveTopicId(db, command.topicId) : undefined,
      total: sessions.length,
      byStatus
    }
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    io.stdout.write(`total=${result.total}\n`)
    for (const [status, count] of Object.entries(result.byStatus)) {
      io.stdout.write(`${status}=${count}\n`)
    }
  }
  return 0
}

function executeTerminalOutput(
  command: Extract<CliCommand, { name: 'terminal-output' }>,
  io: CliIO
): number | Promise<number> {
  if (!command.dbPath && !command.includeDeleted) {
    return requestLiveControl('terminal.output', {
      sessionId: command.sessionId,
      topicId: command.topicId
    }).then((live) => {
      if (!live.available) return executeTerminalOutputFromDb(command, io)
      const result = live.result as { session?: TerminalSession; buffer?: string }
      if (command.outputFormat === 'json') {
        io.stdout.write(`${JSON.stringify({ live: true, ...result }, null, 2)}\n`)
      } else if (!result.session) {
        io.stdout.write('No terminal session found.\n')
      } else if (command.raw) {
        io.stdout.write(result.buffer ?? '')
      } else {
        io.stdout.write(formatLiveTerminalOutput(result.session, result.buffer ?? ''))
      }
      return 0
    })
  }
  return executeTerminalOutputFromDb(command, io)
}

function executeTerminalOutputFromDb(
  command: Extract<CliCommand, { name: 'terminal-output' }>,
  io: CliIO
): number {
  const result = withDatabase(command.dbPath, (db) => {
    if (!hasTable(db, 'terminal_sessions')) return { session: undefined, io: [] }
    const session = resolveTerminalSession(db, command.sessionId, {
      topicId: command.topicId,
      includeDeleted: command.includeDeleted
    })
    if (!session) return { session: undefined, io: [] }
    const rows = db
      .prepare(
        `
        SELECT * FROM terminal_io
        WHERE sessionId = ?
          ${command.includeDeleted ? '' : 'AND isDeleted = 0'}
        ORDER BY timestamp DESC
        LIMIT ?
      `
      )
      .all(session.id, command.limit) as TerminalIORow[]
    return { session, io: rows.map(mapTerminalIORow).reverse() }
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (!result.session) {
    io.stdout.write('No terminal session found.\n')
  } else if (command.raw) {
    io.stdout.write(result.io.map((entry) => entry.content).join(''))
  } else {
    io.stdout.write(formatTerminalOutput(result.session, result.io))
  }
  return 0
}

async function executeRun(
  command: Extract<CliCommand, { name: 'run' }>,
  io: CliIO
): Promise<number> {
  const result = await runProcess({
    command: command.command,
    shellCommand: command.shellCommand,
    cwd: command.cwd,
    timeoutMs: command.timeoutMs,
    stream: command.outputFormat === 'plain',
    io
  })

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (result.timedOut) {
    io.stderr.write(`\nCommand timed out after ${command.timeoutMs}ms\n`)
  }

  return result.exitCode ?? (result.timedOut ? 124 : 1)
}

async function executeDoctor(
  command: Extract<CliCommand, { name: 'doctor' }>,
  io: CliIO
): Promise<number> {
  const startedAt = Date.now()
  const checks = command.checks.map((name) => doctorCheck(name))
  const results: Array<RunProcessResult & { name: DoctorCheckName }> = []

  for (const check of checks) {
    if (command.outputFormat === 'plain') io.stdout.write(`\n== ${check.name} ==\n`)
    const result = await runProcess({
      command: [check.command, ...check.args],
      cwd: process.cwd(),
      timeoutMs: command.timeoutMs,
      stream: command.outputFormat === 'plain',
      io
    })
    results.push({ ...result, name: check.name })
  }

  const failed = results.filter((result) => result.exitCode !== 0 || result.timedOut)
  const summary = {
    status: failed.length === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    checks: results
  }

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    io.stdout.write(`\nDoctor ${summary.status} in ${summary.durationMs}ms\n`)
    for (const result of results) {
      const status = result.exitCode === 0 && !result.timedOut ? 'ok' : 'failed'
      io.stdout.write(`- ${result.name}: ${status} (${result.durationMs}ms)\n`)
    }
  }

  return failed.length === 0 ? 0 : 1
}

function executeToolsList(command: Extract<CliCommand, { name: 'tools-list' }>, io: CliIO): number {
  const tools = command.category
    ? CLI_TOOL_MANIFEST.filter((tool) => tool.category === command.category)
    : CLI_TOOL_MANIFEST

  if (command.outputFormat === 'json') {
    io.stdout.write(`${JSON.stringify(tools, null, 2)}\n`)
    return 0
  }

  if (tools.length === 0) {
    io.stdout.write(`No tools found for category "${command.category}".\n`)
    return 1
  }

  io.stdout.write(formatTools(tools))
  return 0
}

async function runProcess(options: {
  command: string[]
  shellCommand?: string
  cwd?: string
  timeoutMs: number
  stream: boolean
  io: CliIO
}): Promise<RunProcessResult> {
  const cwd = path.resolve(options.cwd ? expandHome(options.cwd) : process.cwd())
  const startedAt = Date.now()
  const command = options.shellCommand ?? options.command[0]
  const args = options.shellCommand ? [] : options.command.slice(1)
  let stdout = ''
  let stderr = ''
  let timedOut = false

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    shell: Boolean(options.shellCommand),
    windowsHide: true
  })

  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, options.timeoutMs)

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stdout += text
    if (options.stream) options.io.stdout.write(text)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stderr += text
    if (options.stream) options.io.stderr.write(text)
  })

  return new Promise((resolve) => {
    child.on('error', (error) => {
      clearTimeout(timeout)
      stderr += `${error.message}\n`
      resolve({
        command,
        args,
        cwd,
        exitCode: 1,
        signal: null,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      })
    })
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout)
      resolve({
        command,
        args,
        cwd,
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      })
    })
  })
}

function doctorCheck(name: DoctorCheckName): {
  name: DoctorCheckName
  command: string
  args: string[]
} {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  if (name === 'typecheck') return { name, command: npm, args: ['run', 'typecheck'] }
  if (name === 'test') return { name, command: npm, args: ['test'] }
  return { name, command: npm, args: ['run', 'lint'] }
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

  const request: CliControlRequest = {
    id: uuidv4(),
    command,
    args
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let buffer = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ available: false })
    }, timeoutMs)

    const finish = (result: LiveControlResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.end()
      resolve(result)
    }

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return

      const line = buffer.slice(0, newlineIndex)
      const response = JSON.parse(line) as CliControlResponse
      if (!response.ok) {
        clearTimeout(timeout)
        socket.end()
        settled = true
        reject(new Error(response.error ?? 'CLI control request failed'))
        return
      }
      finish({ available: true, result: response.result })
    })
    socket.on('error', () => finish({ available: false }))
  })
}

function prepareRuntimeDatabase(dbPath?: string): string {
  const resolvedPath = resolveDbPath(dbPath)
  process.env.OPENTERM_DB = resolvedPath
  process.env.OPENTERM_SKIP_RECOVERY = '1'
  return resolvedPath
}

async function tryResolveProviderSelection(topicId: string): Promise<
  | {
      provider: { id: string }
      modelRecordId?: string
    }
  | undefined
> {
  try {
    const { resolveProviderSelection } = requireModule('../main/ai') as typeof import('../main/ai')
    return resolveProviderSelection({ topicId })
  } catch {
    return undefined
  }
}

function createCliWebContents(
  io: CliIO,
  verboseEvents: boolean,
  events: CliWebContentsEvent[]
): WebContents {
  const webContents = {
    id: 0,
    isDestroyed: () => false,
    send: (event: string, payload: unknown) => {
      events.push({ event, payload })
      if (verboseEvents) io.stderr.write(`[event:${event}] ${JSON.stringify(payload)}\n`)
    }
  }
  return webContents as unknown as WebContents
}

function resolveOrCreateChatTopic(
  appDatabase: {
    topics: {
      getTopics(): Topic[]
      getTopicById(id: string): Topic | undefined
      createTopic(title: string, hostIds: string[]): Topic
    }
  },
  command: Extract<CliCommand, { name: 'chat-send' }>
): Topic {
  if (command.createTopic) {
    return appDatabase.topics.createTopic(
      command.title ?? defaultTopicTitle(command.content),
      command.hostIds.length > 0 ? command.hostIds : ['local']
    )
  }

  if (command.topicId && command.topicId !== 'latest') {
    const topic = appDatabase.topics.getTopicById(command.topicId)
    if (!topic) throw new Error(`Topic not found: ${command.topicId}`)
    return topic
  }

  const latest = appDatabase.topics.getTopics()[0]
  if (latest) return latest

  return appDatabase.topics.createTopic(
    command.title ?? defaultTopicTitle(command.content),
    command.hostIds.length > 0 ? command.hostIds : ['local']
  )
}

function defaultTopicTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, 30) + (normalized.length > 30 ? '...' : '')
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

  const topic = getTopicById(db, topicId)
  return topic?.id
}

function getTopicById(db: Database.Database, topicId: string): Topic | undefined {
  const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId) as TopicRow | undefined
  return row ? mapTopicRow(row) : undefined
}

function selectTerminalSessions(
  db: Database.Database,
  options: {
    topicId?: string
    includeDeleted: boolean
    status?: string
  }
): TerminalSession[] {
  if (!hasTable(db, 'terminal_sessions')) return []
  const params: unknown[] = []
  const where: string[] = ['1 = 1']
  const topicId = options.topicId ? resolveTopicId(db, options.topicId) : undefined

  if (options.topicId && !topicId) return []
  if (topicId) {
    where.push('topicId = ?')
    params.push(topicId)
  }
  if (!options.includeDeleted) where.push('isDeleted = 0')
  if (options.status) {
    where.push('status = ?')
    params.push(options.status)
  }

  const rows = db
    .prepare(`SELECT * FROM terminal_sessions WHERE ${where.join(' AND ')} ORDER BY createdAt DESC`)
    .all(...params) as TerminalSessionRow[]
  return rows.map(mapTerminalSessionRow)
}

function resolveTerminalSession(
  db: Database.Database,
  sessionId: string,
  options: { topicId?: string; includeDeleted: boolean }
): TerminalSession | undefined {
  const topicId = options.topicId ? resolveTopicId(db, options.topicId) : undefined
  if (options.topicId && !topicId) return undefined

  if (sessionId === 'latest') {
    const params: unknown[] = []
    const where: string[] = ['1 = 1']
    if (topicId) {
      where.push('topicId = ?')
      params.push(topicId)
    }
    if (!options.includeDeleted) where.push('isDeleted = 0')
    const row = db
      .prepare(
        `SELECT * FROM terminal_sessions WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT 1`
      )
      .get(...params) as TerminalSessionRow | undefined
    return row ? mapTerminalSessionRow(row) : undefined
  }

  const row = db
    .prepare(
      `SELECT * FROM terminal_sessions WHERE id = ? ${options.includeDeleted ? '' : 'AND isDeleted = 0'}`
    )
    .get(sessionId) as TerminalSessionRow | undefined
  const session = row ? mapTerminalSessionRow(row) : undefined
  if (topicId && session?.topicId !== topicId) return undefined
  return session
}

function withDatabase<T>(
  dbPath: string | undefined,
  callback: (db: Database.Database, resolvedPath: string) => T
): T {
  const resolvedPath = resolveDbPath(dbPath)
  if (!fs.existsSync(resolvedPath)) throw new Error(`Database file not found: ${resolvedPath}`)

  const db = new Database(resolvedPath, { readonly: true, fileMustExist: true })
  try {
    return callback(db, resolvedPath)
  } finally {
    db.close()
  }
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

function isNonEmptyFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size > 0
  } catch {
    return false
  }
}

function hasTable(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName)
  return Boolean(row)
}

function assertOpenTermSchema(db: Database.Database, resolvedPath: string): void {
  if (!hasTable(db, 'topics')) {
    throw new Error(`Database does not contain the OpenTerm schema: ${resolvedPath}`)
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

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new CliUsageError(`Missing value for ${option}`)
  return value
}

function parseTargetKind(value: string): ConversationDiagnosticTargetKind {
  const allowed: ConversationDiagnosticTargetKind[] = [
    'auto',
    'topic',
    'task',
    'run',
    'part',
    'message',
    'terminal_session',
    'terminal_io'
  ]
  if (!allowed.includes(value as ConversationDiagnosticTargetKind)) {
    throw new CliUsageError(`Invalid target kind: ${value}`)
  }
  return value as ConversationDiagnosticTargetKind
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliUsageError(`${option} must be a positive integer`)
  }
  return parsed
}

function formatTopicRows(rows: TopicListRow[]): string {
  const lines = ['Recent topics', '']
  for (const row of rows) {
    lines.push(
      `${formatTime(row.lastMessageAt)}  ${row.title}  ${row.id}`,
      `  messages=${row.messageCount} tasks=${row.taskCount} runs=${row.runCount} errors=${row.errorCount}`
    )
  }
  return `${lines.join('\n')}\n`
}

function formatTopicDetail(report: ConversationDiagnosticsReport, messageLimit: number): string {
  const lines = [
    `Topic: ${report.topic.title}`,
    `ID: ${report.topic.id}`,
    `Last message: ${formatTime(report.topic.lastMessageAt)}`,
    '',
    'Summary',
    `- messages: ${report.summary.messageCount}`,
    `- tasks: ${report.summary.taskCount}`,
    `- runs: ${report.summary.runCount}`,
    `- terminal commands: ${report.summary.terminalCommandCount}`,
    `- failed commands: ${report.summary.failedCommandCount}`,
    `- errors: ${report.summary.errorCount}`,
    '',
    'Recent messages'
  ]

  for (const entry of report.messages.slice(-messageLimit)) {
    lines.push(
      `- ${entry.message.role} ${formatTime(entry.message.timestamp)} ${truncate(
        entry.message.content,
        160
      )}`
    )
  }

  lines.push('', 'Tasks')
  for (const entry of report.tasks) {
    lines.push(`- ${entry.task.status} ${entry.task.title} (${entry.task.id})`)
  }

  if (report.errors.length > 0) {
    lines.push('', 'Errors')
    for (const error of report.errors) {
      lines.push(`- ${error.severity} ${error.source}: ${error.message}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function formatChatHistory(topic: Topic, messages: Message[]): string {
  const lines = [`Topic: ${topic.title} (${topic.id})`, '']
  for (const message of messages) {
    lines.push(
      `[${formatTime(message.timestamp)}] ${message.role}${message.runId ? ` run=${message.runId}` : ''}`,
      truncate(message.content, 600),
      ''
    )
  }
  return `${lines.join('\n')}\n`
}

function formatTerminalSessions(sessions: TerminalSession[]): string {
  if (sessions.length === 0) return 'No terminal sessions found.\n'
  const lines = [`Terminal sessions: ${sessions.length}`, '']
  for (const session of sessions) {
    lines.push(
      `${session.id}  ${session.status}  topic=${session.topicId} host=${session.hostId} role=${session.role ?? 'user'}`,
      `  name=${session.name ?? '-'} created=${formatTime(session.createdAt)} closed=${formatTime(
        session.closedAt
      )} deleted=${session.isDeleted === true ? 'yes' : 'no'}`
    )
  }
  return `${lines.join('\n')}\n`
}

function formatTerminalOutput(session: TerminalSession, entries: TerminalIO[]): string {
  const lines = [
    `Terminal: ${session.name ?? session.id}`,
    `ID: ${session.id}`,
    `Topic: ${session.topicId}`,
    ''
  ]
  if (entries.length === 0) {
    lines.push('No terminal output found.')
    return `${lines.join('\n')}\n`
  }

  for (const entry of entries) {
    const exitCode = entry.exitCode === undefined ? '' : ` exit=${entry.exitCode}`
    const cwd = entry.cwd ? ` cwd=${entry.cwd}` : ''
    lines.push(`[${formatTime(entry.timestamp)}] ${entry.type}/${entry.source}${exitCode}${cwd}`)
    lines.push(entry.content.trimEnd())
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function formatLiveTerminalOutput(session: TerminalSession, buffer: string): string {
  return [
    `Terminal: ${session.name ?? session.id}`,
    `ID: ${session.id}`,
    `Topic: ${session.topicId}`,
    'Source: live app session buffer',
    '',
    buffer || 'No live terminal buffer found.',
    ''
  ].join('\n')
}

function formatTools(tools: typeof CLI_TOOL_MANIFEST): string {
  const lines = ['OpenTerm tools', '']
  for (const tool of tools) {
    const runtime = tool.requiresAppRuntime ? 'app-runtime' : 'cli-safe'
    lines.push(`${tool.id}  [${tool.category}/${tool.mode}/${runtime}]`, `  ${tool.summary}`)
  }
  return `${lines.join('\n')}\n`
}

function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toISOString()
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

function formatHelp(): string {
  return `Usage:
  npm run cli -- <command> [options]

Commands:
  app status|ping             Inspect the live app control socket and DB path.
  hosts list|show|create|delete
                               Manage local/SSH host records.
  diagnose <id|latest>        Print conversation diagnostics; exits non-zero on recorded errors.
  topics list|show|create|rename|delete|model|hosts
                               Manage topics, topic hosts, and selected model.
  chat send <message>         Send a message through the same Agent runtime used by the UI.
  chat history [topic]        Show recent messages for a topic.
  chat watch [topic]          Stream run/part events as NDJSON by polling the DB.
  runs list|show|parts|cancel|resume|watch
                               Inspect and control agent runs.
  approvals list|show|approve|reject
                               Inspect and answer agent approval requests.
  tasks list|show|steps       Inspect tasks and steps.
  artifacts list|show|export  Inspect and export agent artifacts.
  terminal list|count|output|open|input|resize|attach|close|rename|pin|pause|execute
                               Inspect and control live terminal sessions.
  files local|sftp|transfer   Manage local files, SFTP sessions, and transfers.
  pf list|create|close        Manage SSH port forwards.
  settings providers|models|permissions|model-settings
                               Manage providers, models, permission settings, and web search keys.
  memory list|create|update|delete|global
                               Manage scoped and global memory.
  history search              Search recorded terminal command inputs.
  sessions recoverable|watch  Inspect recoverable terminal sessions.
  debug logs --follow         Stream live debug logs as NDJSON.
  run -- <command...>         Run a local command with timeout and optional JSON output.
  doctor                      Run typecheck and tests as one self-feedback loop.
  tools list                  Show the tool/control surface available to agents.

Common options:
  --json                      Emit machine-readable JSON where supported.
  --db <path>                 Use a specific openterm.db path for database commands.
  --live-only                 Require the desktop app runtime for read commands.
  --timeout-ms <ms>           Override command or watch timeout where supported.

Examples:
  npm run cli -- app status --json
  npm run cli -- hosts list
  npm run cli -- topics list --limit 5
  npm run cli -- topics hosts add latest local
  npm run cli -- chat send --new-topic "检查当前项目状态"
  npm run cli -- chat watch latest
  npm run cli -- runs cancel latest
  npm run cli -- approvals approve latest --always-allow
  npm run cli -- terminal count --topic latest
  npm run cli -- terminal open --topic latest --host local --name work
  npm run cli -- terminal input latest $'pwd\\n'
  npm run cli -- terminal output latest --topic latest --tail 40
  npm run cli -- history search "npm test"
  npm run cli -- diagnose latest --focused
  npm run cli -- run -- npm test
  npm run cli -- doctor --lint
`
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entrypoint) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
