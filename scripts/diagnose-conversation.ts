#!/usr/bin/env tsx
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildConversationDiagnostics,
  formatConversationDiagnosticsMarkdown,
  type ConversationDiagnosticTargetKind,
  type ConversationDiagnosticsOptions
} from '../src/main/db/conversation-diagnostics'

type OutputFormat = 'markdown' | 'json'

interface CliOptions {
  targetId: string
  targetKind: ConversationDiagnosticTargetKind
  dbPath: string
  outputFormat: OutputFormat
  diagnosticsOptions: ConversationDiagnosticsOptions
}

function parseArgs(argv: string[]): CliOptions {
  let targetId = ''
  let targetKind: ConversationDiagnosticTargetKind = 'auto'
  let dbPath = ''
  let outputFormat: OutputFormat = 'markdown'
  let includeDeleted = false
  let terminalIOLimit = 1000
  let scope: ConversationDiagnosticsOptions['scope'] = 'topic'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
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
    if (arg === '--include-deleted') {
      includeDeleted = true
      continue
    }
    if (arg === '--focused') {
      scope = 'focused'
      continue
    }
    if (arg === '--io-limit') {
      terminalIOLimit = parsePositiveInteger(requireValue(argv, index, arg), arg)
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    if (targetId) throw new Error(`Unexpected extra argument: ${arg}`)
    targetId = arg
  }

  if (!targetId) {
    printHelp()
    throw new Error('Missing target id')
  }

  return {
    targetId,
    targetKind,
    dbPath: expandHome(dbPath || resolveDefaultDbPath()),
    outputFormat,
    diagnosticsOptions: {
      includeDeleted,
      terminalIOLimit,
      scope
    }
  }
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
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
    throw new Error(`Invalid --kind value: ${value}`)
  }
  return value as ConversationDiagnosticTargetKind
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`)
  }
  return parsed
}

function resolveDefaultDbPath(): string {
  const candidates = [
    process.env.OPENTERM_DB,
    path.join(process.cwd(), 'openterm.db'),
    path.join(os.homedir(), 'Library', 'Application Support', 'openterm', 'openterm.db')
  ].filter((candidate): candidate is string => Boolean(candidate))

  const existing = candidates.find((candidate) => fs.existsSync(expandHome(candidate)))
  return existing ?? candidates[0]
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

function printHelp(): void {
  const defaultPath = resolveDefaultDbPath()
  console.log(`
Usage:
  npx tsx scripts/diagnose-conversation.ts <id|latest> [options]

Options:
  --db <path>           SQLite database path. Default: ${defaultPath}
  --kind <kind>         auto, topic, task, run, part, message, terminal_session, terminal_io
  --json                Print raw JSON instead of markdown
  --focused             Limit report to the selected task/run/message/session when possible
  --include-deleted     Include soft-deleted terminal sessions and IO
  --io-limit <number>   Max terminal_io rows to load. Default: 1000

Examples:
  npx tsx scripts/diagnose-conversation.ts latest
  npx tsx scripts/diagnose-conversation.ts topic-123 --kind topic
  npx tsx scripts/diagnose-conversation.ts run-123 --focused --json
`)
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!fs.existsSync(options.dbPath)) {
      throw new Error(`Database file not found: ${options.dbPath}`)
    }

    const db = new Database(options.dbPath, { readonly: true, fileMustExist: true })
    try {
      const report = buildConversationDiagnostics(
        db,
        { id: options.targetId, kind: options.targetKind },
        options.diagnosticsOptions
      )
      if (options.outputFormat === 'json') {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(formatConversationDiagnosticsMarkdown(report))
      }
    } finally {
      db.close()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`diagnose-conversation failed: ${message}`)
    process.exitCode = 1
  }
}

main()
