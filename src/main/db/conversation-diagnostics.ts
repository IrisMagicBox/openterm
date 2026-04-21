import type Database from 'better-sqlite3'
import type {
  AgentPart,
  AgentRun,
  Approval,
  Artifact,
  CommandPattern,
  Host,
  MemoryEntry,
  Message,
  Task,
  TaskStep,
  TerminalIO,
  TerminalSession,
  Topic
} from '../../shared/types'
import {
  mapAgentPartRow,
  mapAgentRunRow,
  mapApprovalRow,
  mapArtifactRow,
  mapCommandPatternRow,
  mapHostRow,
  mapMemoryRow,
  mapMessageRow,
  mapTaskRow,
  mapTaskStepRow,
  mapTerminalIORow,
  mapTerminalSessionRow,
  mapTopicRow,
  parseJSON
} from './mappers'
import type {
  AgentPartRow,
  AgentRunRow,
  ApprovalRow,
  ArtifactRow,
  CommandPatternRow,
  HostRow,
  MemoryRow,
  MessageRow,
  TaskRow,
  TaskStepRow,
  TerminalIORow,
  TerminalSessionRow,
  TopicRow
} from './row-types'

export type ConversationDiagnosticTargetKind =
  | 'auto'
  | 'topic'
  | 'task'
  | 'run'
  | 'part'
  | 'message'
  | 'terminal_session'
  | 'terminal_io'

export type ResolvedConversationTargetKind = Exclude<ConversationDiagnosticTargetKind, 'auto'>

export interface ConversationDiagnosticTarget {
  id: string
  kind?: ConversationDiagnosticTargetKind
}

export interface ConversationDiagnosticsOptions {
  includeDeleted?: boolean
  terminalIOLimit?: number
  scope?: 'topic' | 'focused'
}

export interface ResolvedConversationTarget {
  id: string
  kind: ResolvedConversationTargetKind
  topicId: string
  taskId?: string
  runId?: string
  partId?: string
  messageId?: string
  terminalSessionId?: string
  terminalIOId?: string
}

export interface DiagnosticHost {
  host: Host
  references: string[]
}

export interface DiagnosticMessage {
  message: Message
  taskId?: string
  runId?: string
  toolCallNames: string[]
}

export interface DiagnosticTask {
  task: Task
  steps: TaskStep[]
  approvals: Approval[]
  artifacts: Artifact[]
  runIds: string[]
}

export interface DiagnosticAgentPart {
  part: AgentPart
  host?: Host
  session?: TerminalSession
  message?: Message
}

export interface DiagnosticAgentRun {
  run: AgentRun
  childRunIds: string[]
  parts: DiagnosticAgentPart[]
}

export interface DiagnosticTerminalCommand {
  input: TerminalIO
  output?: TerminalIO
  command: string
  host?: Host
  session: TerminalSession
  task?: Task
  step?: TaskStep
  exitCode?: number
  durationMs?: number
  cwd?: string
}

export interface DiagnosticTerminalSession {
  session: TerminalSession
  host?: Host
  io: TerminalIO[]
  commands: DiagnosticTerminalCommand[]
}

export interface ConversationDiagnosticError {
  source: 'task' | 'task_step' | 'agent_run' | 'agent_part' | 'terminal_command' | 'approval'
  severity: 'error' | 'warning'
  message: string
  timestamp?: number
  ids: Record<string, string>
  hostId?: string
  sessionId?: string
  context?: string
}

export interface ConversationDiagnosticsSummary {
  messageCount: number
  taskCount: number
  runCount: number
  partCount: number
  toolCallCount: number
  terminalSessionCount: number
  terminalIOCount: number
  terminalCommandCount: number
  failedCommandCount: number
  errorCount: number
  hostCount: number
}

export interface ConversationDiagnosticsReport {
  generatedAt: number
  target: ResolvedConversationTarget
  topic: Topic
  hosts: DiagnosticHost[]
  messages: DiagnosticMessage[]
  tasks: DiagnosticTask[]
  agentRuns: DiagnosticAgentRun[]
  terminalSessions: DiagnosticTerminalSession[]
  terminalCommands: DiagnosticTerminalCommand[]
  approvals: Approval[]
  artifacts: Artifact[]
  memories: MemoryEntry[]
  commandPatterns: CommandPattern[]
  errors: ConversationDiagnosticError[]
  summary: ConversationDiagnosticsSummary
}

interface FocusSets {
  taskIds: Set<string>
  runIds: Set<string>
  partIds: Set<string>
  messageIds: Set<string>
  terminalSessionIds: Set<string>
  terminalIOIds: Set<string>
  stepIds: Set<string>
}

const DEFAULT_TERMINAL_IO_LIMIT = 1000

export function buildConversationDiagnostics(
  db: Database.Database,
  target: ConversationDiagnosticTarget,
  options: ConversationDiagnosticsOptions = {}
): ConversationDiagnosticsReport {
  const resolvedTarget = resolveConversationTarget(db, target)
  const topic = getTopic(db, resolvedTarget.topicId)

  if (!topic) {
    throw new Error(`Topic not found for target ${target.id}`)
  }

  const allMessages = selectTopicMessages(db, topic.id)
  const allTasks = selectTopicTasks(db, topic.id)
  const allTaskSteps = selectTopicTaskSteps(db, topic.id)
  const allRuns = selectTopicAgentRuns(db, topic.id)
  const allParts = selectTopicAgentParts(db, topic.id)
  const allSessions = selectTopicTerminalSessions(db, topic.id, options.includeDeleted === true)
  const allTerminalIO = selectTopicTerminalIO(
    db,
    topic.id,
    options.includeDeleted === true,
    options.terminalIOLimit ?? DEFAULT_TERMINAL_IO_LIMIT
  )
  const allApprovals = selectTopicApprovals(db, topic.id)
  const allArtifacts = selectTopicArtifacts(db, topic.id)

  const focus = buildFocusSets(
    resolvedTarget,
    allMessages,
    allTasks,
    allTaskSteps,
    allRuns,
    allParts,
    allSessions,
    allTerminalIO
  )
  const focused = options.scope === 'focused' && resolvedTarget.kind !== 'topic'

  const messages = focused
    ? allMessages.filter((message) => isFocusedMessage(message, focus))
    : allMessages
  const tasks = focused ? allTasks.filter((task) => focus.taskIds.has(task.id)) : allTasks
  const taskSteps = focused
    ? allTaskSteps.filter((step) => focus.stepIds.has(step.id) || focus.taskIds.has(step.taskId))
    : allTaskSteps
  const runs = focused
    ? allRuns.filter((run) => focus.runIds.has(run.id) || focus.taskIds.has(run.taskId))
    : allRuns
  const parts = focused
    ? allParts.filter((part) => focus.partIds.has(part.id) || focus.runIds.has(part.runId))
    : allParts
  const sessions = focused
    ? allSessions.filter((session) => focus.terminalSessionIds.has(session.id))
    : allSessions
  const terminalIO = focused
    ? allTerminalIO.filter((io) => isFocusedTerminalIO(io, focus))
    : allTerminalIO
  const approvals = focused
    ? allApprovals.filter((approval) => focus.taskIds.has(approval.taskId))
    : allApprovals
  const artifacts = focused
    ? allArtifacts.filter((artifact) => focus.taskIds.has(artifact.taskId))
    : allArtifacts

  const hostIds = collectHostIds(topic, taskSteps, parts, sessions, terminalIO)
  const hosts = selectHosts(db, hostIds)
  const hostMap = new Map(hosts.map((host) => [host.id, host]))
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))
  const messageMap = new Map(messages.map((message) => [message.id, message]))
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const stepMap = new Map(taskSteps.map((step) => [step.id, step]))

  const diagnosticMessages = messages.map((message) => buildDiagnosticMessage(message))
  const terminalCommands = buildTerminalCommands(terminalIO, sessionMap, hostMap, taskMap, stepMap)
  const diagnosticSessions = sessions.map((session) =>
    buildDiagnosticTerminalSession(session, terminalIO, terminalCommands, hostMap)
  )
  const diagnosticRuns = runs.map((run) =>
    buildDiagnosticAgentRun(run, runs, parts, hostMap, sessionMap, messageMap)
  )
  const diagnosticTasks = tasks.map((task) =>
    buildDiagnosticTask(task, taskSteps, approvals, artifacts, runs)
  )
  const diagnosticHosts = buildDiagnosticHosts(hosts, topic, taskSteps, parts, sessions, terminalIO)
  const memories = selectMemories(db, topic.id, hostIds)
  const commandPatterns = selectCommandPatterns(db, hostIds)
  const errors = collectDiagnosticErrors(
    diagnosticTasks,
    diagnosticRuns,
    terminalCommands,
    approvals
  )

  return {
    generatedAt: Date.now(),
    target: resolvedTarget,
    topic,
    hosts: diagnosticHosts,
    messages: diagnosticMessages,
    tasks: diagnosticTasks,
    agentRuns: diagnosticRuns,
    terminalSessions: diagnosticSessions,
    terminalCommands,
    approvals,
    artifacts,
    memories,
    commandPatterns,
    errors,
    summary: {
      messageCount: diagnosticMessages.length,
      taskCount: diagnosticTasks.length,
      runCount: diagnosticRuns.length,
      partCount: parts.length,
      toolCallCount: parts.filter((part) => part.type === 'tool').length,
      terminalSessionCount: diagnosticSessions.length,
      terminalIOCount: terminalIO.length,
      terminalCommandCount: terminalCommands.length,
      failedCommandCount: terminalCommands.filter(
        (command) => command.exitCode !== undefined && command.exitCode !== 0
      ).length,
      errorCount: errors.length,
      hostCount: diagnosticHosts.length
    }
  }
}

export function formatConversationDiagnosticsMarkdown(
  report: ConversationDiagnosticsReport,
  maxContentLength = 240
): string {
  const lines: string[] = []
  lines.push('# Conversation Diagnostics')
  lines.push('')
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`)
  lines.push(`Target: ${report.target.kind} ${report.target.id}`)
  lines.push(`Topic: ${report.topic.title} (${report.topic.id})`)
  lines.push('')
  lines.push('## Summary')
  lines.push(`- Messages: ${report.summary.messageCount}`)
  lines.push(`- Tasks: ${report.summary.taskCount}`)
  lines.push(`- Agent runs: ${report.summary.runCount}`)
  lines.push(`- Agent parts: ${report.summary.partCount}`)
  lines.push(`- Tool calls: ${report.summary.toolCallCount}`)
  lines.push(`- Terminal sessions: ${report.summary.terminalSessionCount}`)
  lines.push(`- Terminal commands: ${report.summary.terminalCommandCount}`)
  lines.push(`- Failed commands: ${report.summary.failedCommandCount}`)
  lines.push(`- Errors: ${report.summary.errorCount}`)
  lines.push('')
  lines.push('## Hosts')
  pushList(
    lines,
    report.hosts.map((entry) => {
      const host = entry.host
      return `${host.alias} (${host.id}) ${host.username}@${host.ip}:${host.port} refs=${entry.references.join(',')}`
    })
  )
  lines.push('')
  lines.push('## Recent Messages')
  pushList(
    lines,
    report.messages.slice(-10).map((entry) => {
      const message = entry.message
      return `${message.role} ${message.id} ${formatTime(message.timestamp)}: ${truncate(message.content, maxContentLength)}`
    })
  )
  lines.push('')
  lines.push('## Agent Runs')
  pushList(
    lines,
    report.agentRuns.map((entry) => {
      const run = entry.run
      return `${run.status} ${run.agentName}/${run.mode} ${run.id} task=${run.taskId} parts=${entry.parts.length}${run.error ? ` error=${truncate(run.error, maxContentLength)}` : ''}`
    })
  )
  lines.push('')
  lines.push('## Tool Parts')
  pushList(
    lines,
    report.agentRuns.flatMap((run) =>
      run.parts
        .filter((entry) => entry.part.type === 'tool')
        .map((entry) => {
          const part = entry.part
          return `${part.status} ${part.toolName ?? 'unknown'} part=${part.id} host=${part.hostId ?? '-'} session=${part.sessionId ?? '-'} input=${truncate(part.input ?? '', maxContentLength)} error=${truncate(part.error ?? '', maxContentLength)}`
        })
    )
  )
  lines.push('')
  lines.push('## Terminal Commands')
  pushList(
    lines,
    report.terminalCommands.slice(-20).map((command) => {
      const exitCode = command.exitCode === undefined ? '-' : String(command.exitCode)
      return `${formatTime(command.input.timestamp)} exit=${exitCode} host=${command.input.hostId} session=${command.input.sessionId} cwd=${command.cwd ?? '-'} command=${truncate(command.command, maxContentLength)}`
    })
  )
  lines.push('')
  lines.push('## Errors')
  pushList(
    lines,
    report.errors.map((error) => {
      return `${error.severity} ${error.source} ${formatTime(error.timestamp)} ${error.message} ids=${JSON.stringify(error.ids)}${error.context ? ` context=${truncate(error.context, maxContentLength)}` : ''}`
    })
  )
  lines.push('')
  return lines.join('\n')
}

export function resolveConversationTarget(
  db: Database.Database,
  target: ConversationDiagnosticTarget
): ResolvedConversationTarget {
  const kind = target.kind ?? 'auto'
  if (target.id === 'latest' && (kind === 'auto' || kind === 'topic')) {
    const latestTopic = getLatestTopic(db)
    if (!latestTopic) throw new Error('No topics found')
    return { kind: 'topic', id: latestTopic.id, topicId: latestTopic.id }
  }

  if (kind !== 'auto') return resolveExplicitTarget(db, target.id, kind)

  const resolvers: Array<() => ResolvedConversationTarget | undefined> = [
    () => resolveTopicTarget(db, target.id),
    () => resolveTaskTarget(db, target.id),
    () => resolveRunTarget(db, target.id),
    () => resolvePartTarget(db, target.id),
    () => resolveMessageTarget(db, target.id),
    () => resolveTerminalSessionTarget(db, target.id),
    () => resolveTerminalIOTarget(db, target.id)
  ]

  for (const resolver of resolvers) {
    const resolved = resolver()
    if (resolved) return resolved
  }

  throw new Error(`Could not resolve conversation target: ${target.id}`)
}

function resolveExplicitTarget(
  db: Database.Database,
  id: string,
  kind: ConversationDiagnosticTargetKind
): ResolvedConversationTarget {
  if (kind === 'auto') return resolveConversationTarget(db, { id, kind: 'auto' })
  const resolverByKind: Record<
    ResolvedConversationTargetKind,
    () => ResolvedConversationTarget | undefined
  > = {
    topic: () => resolveTopicTarget(db, id),
    task: () => resolveTaskTarget(db, id),
    run: () => resolveRunTarget(db, id),
    part: () => resolvePartTarget(db, id),
    message: () => resolveMessageTarget(db, id),
    terminal_session: () => resolveTerminalSessionTarget(db, id),
    terminal_io: () => resolveTerminalIOTarget(db, id)
  }
  const resolved = resolverByKind[kind]()
  if (!resolved) throw new Error(`Could not resolve ${kind} target: ${id}`)
  return resolved
}

function resolveTopicTarget(
  db: Database.Database,
  topicId: string
): ResolvedConversationTarget | undefined {
  const topic = getTopic(db, topicId)
  return topic ? { kind: 'topic', id: topic.id, topicId: topic.id } : undefined
}

function resolveTaskTarget(
  db: Database.Database,
  taskId: string
): ResolvedConversationTarget | undefined {
  const task = getRow<TaskRow>(db, 'tasks', taskId)
  return task ? { kind: 'task', id: task.id, topicId: task.topicId, taskId: task.id } : undefined
}

function resolveRunTarget(
  db: Database.Database,
  runId: string
): ResolvedConversationTarget | undefined {
  const run = getRow<AgentRunRow>(db, 'agent_runs', runId)
  return run
    ? { kind: 'run', id: run.id, topicId: run.topicId, taskId: run.taskId, runId: run.id }
    : undefined
}

function resolvePartTarget(
  db: Database.Database,
  partId: string
): ResolvedConversationTarget | undefined {
  const part = getRow<AgentPartRow>(db, 'agent_parts', partId)
  if (!part) return undefined
  const run = getRow<AgentRunRow>(db, 'agent_runs', part.runId)
  if (!run) return undefined
  return {
    kind: 'part',
    id: part.id,
    topicId: run.topicId,
    taskId: run.taskId,
    runId: run.id,
    partId: part.id,
    messageId: part.messageId ?? undefined,
    terminalSessionId: part.sessionId ?? undefined
  }
}

function resolveMessageTarget(
  db: Database.Database,
  messageId: string
): ResolvedConversationTarget | undefined {
  const message = getRow<MessageRow>(db, 'messages', messageId)
  if (!message) return undefined
  const mapped = mapMessageRow(message)
  return {
    kind: 'message',
    id: mapped.id,
    topicId: mapped.topicId,
    taskId: typeof mapped.metadata?.taskId === 'string' ? mapped.metadata.taskId : undefined,
    runId: mapped.runId,
    messageId: mapped.id
  }
}

function resolveTerminalSessionTarget(
  db: Database.Database,
  sessionId: string
): ResolvedConversationTarget | undefined {
  const session = getRow<TerminalSessionRow>(db, 'terminal_sessions', sessionId)
  return session
    ? {
        kind: 'terminal_session',
        id: session.id,
        topicId: session.topicId,
        terminalSessionId: session.id
      }
    : undefined
}

function resolveTerminalIOTarget(
  db: Database.Database,
  terminalIOId: string
): ResolvedConversationTarget | undefined {
  const io = getRow<TerminalIORow>(db, 'terminal_io', terminalIOId)
  if (!io) return undefined
  return {
    kind: 'terminal_io',
    id: io.id,
    topicId: io.topicId,
    taskId: io.taskId ?? undefined,
    terminalSessionId: io.sessionId,
    terminalIOId: io.id
  }
}

function buildFocusSets(
  target: ResolvedConversationTarget,
  messages: Message[],
  tasks: Task[],
  steps: TaskStep[],
  runs: AgentRun[],
  parts: AgentPart[],
  sessions: TerminalSession[],
  terminalIO: TerminalIO[]
): FocusSets {
  const focus: FocusSets = {
    taskIds: new Set(),
    runIds: new Set(),
    partIds: new Set(),
    messageIds: new Set(),
    terminalSessionIds: new Set(),
    terminalIOIds: new Set(),
    stepIds: new Set()
  }

  if (target.taskId) focus.taskIds.add(target.taskId)
  if (target.runId) addRunTree(target.runId, runs, focus.runIds)
  if (target.partId) focus.partIds.add(target.partId)
  if (target.messageId) focus.messageIds.add(target.messageId)
  if (target.terminalSessionId) focus.terminalSessionIds.add(target.terminalSessionId)
  if (target.terminalIOId) focus.terminalIOIds.add(target.terminalIOId)

  for (const run of runs) {
    if (focus.runIds.has(run.id)) focus.taskIds.add(run.taskId)
    if (focus.taskIds.has(run.taskId)) focus.runIds.add(run.id)
  }

  for (const part of parts) {
    if (focus.runIds.has(part.runId)) {
      focus.partIds.add(part.id)
      if (part.messageId) focus.messageIds.add(part.messageId)
      if (part.sessionId) focus.terminalSessionIds.add(part.sessionId)
    }
  }

  for (const message of messages) {
    if (message.runId && focus.runIds.has(message.runId)) focus.messageIds.add(message.id)
    if (
      typeof message.metadata?.taskId === 'string' &&
      focus.taskIds.has(message.metadata.taskId)
    ) {
      focus.messageIds.add(message.id)
    }
  }

  for (const step of steps) {
    if (focus.taskIds.has(step.taskId)) focus.stepIds.add(step.id)
  }

  for (const io of terminalIO) {
    if (
      focus.terminalSessionIds.has(io.sessionId) ||
      (io.taskId !== undefined && focus.taskIds.has(io.taskId)) ||
      (io.stepId !== undefined && focus.stepIds.has(io.stepId))
    ) {
      focus.terminalIOIds.add(io.id)
      focus.terminalSessionIds.add(io.sessionId)
      if (io.taskId) focus.taskIds.add(io.taskId)
      if (io.stepId) focus.stepIds.add(io.stepId)
    }
  }

  for (const session of sessions) {
    if (focus.terminalSessionIds.has(session.id)) focus.terminalSessionIds.add(session.id)
  }

  if (target.kind === 'topic') {
    for (const task of tasks) focus.taskIds.add(task.id)
    for (const run of runs) focus.runIds.add(run.id)
    for (const part of parts) focus.partIds.add(part.id)
    for (const message of messages) focus.messageIds.add(message.id)
    for (const session of sessions) focus.terminalSessionIds.add(session.id)
    for (const io of terminalIO) focus.terminalIOIds.add(io.id)
    for (const step of steps) focus.stepIds.add(step.id)
  }

  return focus
}

function addRunTree(runId: string, runs: AgentRun[], output: Set<string>): void {
  output.add(runId)
  for (const child of runs) {
    if (child.parentRunId === runId && !output.has(child.id)) addRunTree(child.id, runs, output)
  }
}

function isFocusedMessage(message: Message, focus: FocusSets): boolean {
  if (focus.messageIds.has(message.id)) return true
  if (message.runId && focus.runIds.has(message.runId)) return true
  return typeof message.metadata?.taskId === 'string' && focus.taskIds.has(message.metadata.taskId)
}

function isFocusedTerminalIO(io: TerminalIO, focus: FocusSets): boolean {
  if (focus.terminalIOIds.has(io.id)) return true
  if (focus.terminalSessionIds.has(io.sessionId)) return true
  if (io.taskId && focus.taskIds.has(io.taskId)) return true
  return io.stepId !== undefined && focus.stepIds.has(io.stepId)
}

function buildDiagnosticMessage(message: Message): DiagnosticMessage {
  return {
    message,
    taskId: typeof message.metadata?.taskId === 'string' ? message.metadata.taskId : undefined,
    runId: message.runId,
    toolCallNames:
      message.toolCalls
        ?.map((toolCall) => toolCall.function.name)
        .filter((name) => name.length > 0) ?? []
  }
}

function buildDiagnosticTask(
  task: Task,
  steps: TaskStep[],
  approvals: Approval[],
  artifacts: Artifact[],
  runs: AgentRun[]
): DiagnosticTask {
  return {
    task,
    steps: steps.filter((step) => step.taskId === task.id),
    approvals: approvals.filter((approval) => approval.taskId === task.id),
    artifacts: artifacts.filter((artifact) => artifact.taskId === task.id),
    runIds: runs.filter((run) => run.taskId === task.id).map((run) => run.id)
  }
}

function buildDiagnosticAgentRun(
  run: AgentRun,
  runs: AgentRun[],
  parts: AgentPart[],
  hostMap: Map<string, Host>,
  sessionMap: Map<string, TerminalSession>,
  messageMap: Map<string, Message>
): DiagnosticAgentRun {
  return {
    run,
    childRunIds: runs
      .filter((candidate) => candidate.parentRunId === run.id)
      .map((child) => child.id),
    parts: parts
      .filter((part) => part.runId === run.id)
      .map((part) => ({
        part,
        host: part.hostId ? hostMap.get(part.hostId) : undefined,
        session: part.sessionId ? sessionMap.get(part.sessionId) : undefined,
        message: part.messageId ? messageMap.get(part.messageId) : undefined
      }))
  }
}

function buildDiagnosticTerminalSession(
  session: TerminalSession,
  terminalIO: TerminalIO[],
  commands: DiagnosticTerminalCommand[],
  hostMap: Map<string, Host>
): DiagnosticTerminalSession {
  return {
    session,
    host: hostMap.get(session.hostId),
    io: terminalIO.filter((io) => io.sessionId === session.id),
    commands: commands.filter((command) => command.session.id === session.id)
  }
}

function buildTerminalCommands(
  terminalIO: TerminalIO[],
  sessionMap: Map<string, TerminalSession>,
  hostMap: Map<string, Host>,
  taskMap: Map<string, Task>,
  stepMap: Map<string, TaskStep>
): DiagnosticTerminalCommand[] {
  const outputsByRelatedInput = new Map<string, TerminalIO>()
  for (const io of terminalIO) {
    if (io.type === 'output' && io.relatedInputId) outputsByRelatedInput.set(io.relatedInputId, io)
  }

  return terminalIO
    .filter((io) => io.type === 'input')
    .flatMap((input) => {
      const session = sessionMap.get(input.sessionId)
      if (!session) return []
      const output = outputsByRelatedInput.get(input.id)
      return [
        {
          input,
          output,
          command: input.content,
          host: hostMap.get(input.hostId),
          session,
          task: input.taskId ? taskMap.get(input.taskId) : undefined,
          step: input.stepId ? stepMap.get(input.stepId) : undefined,
          exitCode: output?.exitCode,
          durationMs: output?.durationMs,
          cwd: output?.cwd ?? input.cwd
        }
      ]
    })
}

function buildDiagnosticHosts(
  hosts: Host[],
  topic: Topic,
  steps: TaskStep[],
  parts: AgentPart[],
  sessions: TerminalSession[],
  terminalIO: TerminalIO[]
): DiagnosticHost[] {
  return hosts.map((host) => {
    const references: string[] = []
    if (topic.hostIds.includes(host.id)) references.push('topic')
    if (steps.some((step) => step.hostId === host.id)) references.push('task_steps')
    if (parts.some((part) => part.hostId === host.id)) references.push('agent_parts')
    if (sessions.some((session) => session.hostId === host.id)) references.push('terminal_sessions')
    if (terminalIO.some((io) => io.hostId === host.id)) references.push('terminal_io')
    return { host, references: [...new Set(references)] }
  })
}

function collectDiagnosticErrors(
  tasks: DiagnosticTask[],
  runs: DiagnosticAgentRun[],
  commands: DiagnosticTerminalCommand[],
  approvals: Approval[]
): ConversationDiagnosticError[] {
  const errors: ConversationDiagnosticError[] = []

  for (const task of tasks) {
    if (task.task.status === 'failed') {
      errors.push({
        source: 'task',
        severity: 'error',
        message: task.task.summary ?? `Task failed: ${task.task.title}`,
        timestamp: task.task.updatedAt,
        ids: { taskId: task.task.id }
      })
    }
    for (const step of task.steps) {
      if (step.status === 'failed') {
        errors.push({
          source: 'task_step',
          severity: 'error',
          message: step.title ?? `Task step failed: ${step.id}`,
          timestamp: step.updatedAt,
          ids: { taskId: step.taskId, stepId: step.id },
          hostId: step.hostId,
          context: step.rawOutput
        })
      }
    }
  }

  for (const run of runs) {
    if (run.run.status === 'failed' || run.run.error) {
      errors.push({
        source: 'agent_run',
        severity: 'error',
        message: run.run.error ?? `Run failed: ${run.run.id}`,
        timestamp: run.run.updatedAt,
        ids: { runId: run.run.id, taskId: run.run.taskId }
      })
    }
    for (const entry of run.parts) {
      const part = entry.part
      if (part.status === 'error' || part.error) {
        errors.push({
          source: 'agent_part',
          severity: 'error',
          message: part.error ?? `Agent part error: ${part.id}`,
          timestamp: part.updatedAt,
          ids: { runId: part.runId, partId: part.id },
          hostId: part.hostId,
          sessionId: part.sessionId,
          context: part.output
        })
      }
    }
  }

  for (const command of commands) {
    if (command.exitCode !== undefined && command.exitCode !== 0) {
      errors.push({
        source: 'terminal_command',
        severity: 'error',
        message: `Command exited with ${command.exitCode}: ${command.command}`,
        timestamp: command.output?.timestamp ?? command.input.timestamp,
        ids: {
          inputId: command.input.id,
          outputId: command.output?.id ?? '',
          sessionId: command.session.id
        },
        hostId: command.input.hostId,
        sessionId: command.session.id,
        context: command.output?.content
      })
    }
  }

  for (const approval of approvals) {
    if (approval.status === 'rejected' || approval.status === 'expired') {
      errors.push({
        source: 'approval',
        severity: approval.status === 'rejected' ? 'error' : 'warning',
        message: `Approval ${approval.status}: ${approval.command}`,
        timestamp: approval.respondedAt ?? approval.createdAt,
        ids: { approvalId: approval.id, taskId: approval.taskId }
      })
    }
  }

  return errors.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
}

function collectHostIds(
  topic: Topic,
  steps: TaskStep[],
  parts: AgentPart[],
  sessions: TerminalSession[],
  terminalIO: TerminalIO[]
): string[] {
  const hostIds = new Set(topic.hostIds)
  for (const step of steps) if (step.hostId) hostIds.add(step.hostId)
  for (const part of parts) if (part.hostId) hostIds.add(part.hostId)
  for (const session of sessions) hostIds.add(session.hostId)
  for (const io of terminalIO) hostIds.add(io.hostId)
  return [...hostIds]
}

function getLatestTopic(db: Database.Database): Topic | undefined {
  if (!tableExists(db, 'topics')) return undefined
  const row = db
    .prepare('SELECT * FROM topics ORDER BY lastMessageAt DESC, createdAt DESC LIMIT 1')
    .get() as TopicRow | undefined
  return row ? mapTopicRow(row) : undefined
}

function getTopic(db: Database.Database, topicId: string): Topic | undefined {
  const row = getRow<TopicRow>(db, 'topics', topicId)
  return row ? mapTopicRow(row) : undefined
}

function selectTopicMessages(db: Database.Database, topicId: string): Message[] {
  if (!tableExists(db, 'messages')) return []
  return selectRows<MessageRow>(
    db,
    'SELECT * FROM messages WHERE topicId = ? ORDER BY timestamp ASC',
    [topicId]
  ).map(mapMessageRow)
}

function selectTopicTasks(db: Database.Database, topicId: string): Task[] {
  if (!tableExists(db, 'tasks')) return []
  return selectRows<TaskRow>(db, 'SELECT * FROM tasks WHERE topicId = ? ORDER BY createdAt ASC', [
    topicId
  ]).map(mapTaskRow)
}

function selectTopicTaskSteps(db: Database.Database, topicId: string): TaskStep[] {
  if (!tableExists(db, 'task_steps') || !tableExists(db, 'tasks')) return []
  return selectRows<TaskStepRow>(
    db,
    `
      SELECT s.*
      FROM task_steps s
      JOIN tasks t ON t.id = s.taskId
      WHERE t.topicId = ?
      ORDER BY s.createdAt ASC
    `,
    [topicId]
  ).map(mapTaskStepRow)
}

function selectTopicAgentRuns(db: Database.Database, topicId: string): AgentRun[] {
  if (!tableExists(db, 'agent_runs')) return []
  return selectRows<AgentRunRow>(
    db,
    'SELECT * FROM agent_runs WHERE topicId = ? ORDER BY createdAt ASC',
    [topicId]
  ).map(mapAgentRunRow)
}

function selectTopicAgentParts(db: Database.Database, topicId: string): AgentPart[] {
  if (!tableExists(db, 'agent_parts') || !tableExists(db, 'agent_runs')) return []
  return selectRows<AgentPartRow>(
    db,
    `
      SELECT p.*
      FROM agent_parts p
      JOIN agent_runs r ON r.id = p.runId
      WHERE r.topicId = ?
      ORDER BY r.createdAt ASC, p.orderIndex ASC, p.createdAt ASC
    `,
    [topicId]
  ).map(mapAgentPartRow)
}

function selectTopicTerminalSessions(
  db: Database.Database,
  topicId: string,
  includeDeleted: boolean
): TerminalSession[] {
  if (!tableExists(db, 'terminal_sessions')) return []
  const deletedFilter =
    includeDeleted || !tableHasColumn(db, 'terminal_sessions', 'isDeleted')
      ? ''
      : 'AND COALESCE(isDeleted, 0) = 0'
  return selectRows<TerminalSessionRow>(
    db,
    `SELECT * FROM terminal_sessions WHERE topicId = ? ${deletedFilter} ORDER BY createdAt ASC`,
    [topicId]
  ).map(mapTerminalSessionRow)
}

function selectTopicTerminalIO(
  db: Database.Database,
  topicId: string,
  includeDeleted: boolean,
  limit: number
): TerminalIO[] {
  if (!tableExists(db, 'terminal_io')) return []
  const deletedFilter =
    includeDeleted || !tableHasColumn(db, 'terminal_io', 'isDeleted')
      ? ''
      : 'AND COALESCE(isDeleted, 0) = 0'
  return selectRows<TerminalIORow>(
    db,
    `
      SELECT *
      FROM (
        SELECT *
        FROM terminal_io
        WHERE topicId = ? ${deletedFilter}
        ORDER BY timestamp DESC
        LIMIT ?
      )
      ORDER BY timestamp ASC, chunkIndex ASC
    `,
    [topicId, limit]
  ).map(mapTerminalIORow)
}

function selectTopicApprovals(db: Database.Database, topicId: string): Approval[] {
  if (!tableExists(db, 'approvals') || !tableExists(db, 'tasks')) return []
  return selectRows<ApprovalRow>(
    db,
    `
      SELECT a.*
      FROM approvals a
      JOIN tasks t ON t.id = a.taskId
      WHERE t.topicId = ?
      ORDER BY a.createdAt ASC
    `,
    [topicId]
  ).map(mapApprovalRow)
}

function selectTopicArtifacts(db: Database.Database, topicId: string): Artifact[] {
  if (!tableExists(db, 'artifacts') || !tableExists(db, 'tasks')) return []
  return selectRows<ArtifactRow>(
    db,
    `
      SELECT a.*
      FROM artifacts a
      JOIN tasks t ON t.id = a.taskId
      WHERE t.topicId = ?
      ORDER BY a.createdAt ASC
    `,
    [topicId]
  ).map(mapArtifactRow)
}

function selectHosts(db: Database.Database, hostIds: string[]): Host[] {
  if (!tableExists(db, 'hosts') || hostIds.length === 0) return []
  return selectRows<HostRow>(
    db,
    `SELECT * FROM hosts WHERE id IN (${placeholders(hostIds.length)}) ORDER BY createdAt ASC`,
    hostIds
  ).map(mapHostRow)
}

function selectMemories(db: Database.Database, topicId: string, hostIds: string[]): MemoryEntry[] {
  if (!tableExists(db, 'memories')) return []
  if (hostIds.length === 0) {
    return selectRows<MemoryRow>(
      db,
      'SELECT * FROM memories WHERE topicId = ? ORDER BY timestamp ASC',
      [topicId]
    ).map(mapMemoryRow)
  }
  return selectRows<MemoryRow>(
    db,
    `
      SELECT *
      FROM memories
      WHERE topicId = ? OR hostId IN (${placeholders(hostIds.length)})
      ORDER BY timestamp ASC
    `,
    [topicId, ...hostIds]
  ).map(mapMemoryRow)
}

function selectCommandPatterns(db: Database.Database, hostIds: string[]): CommandPattern[] {
  if (!tableExists(db, 'command_patterns') || hostIds.length === 0) return []
  return selectRows<CommandPatternRow>(
    db,
    `
      SELECT *
      FROM command_patterns
      WHERE hostId IN (${placeholders(hostIds.length)})
      ORDER BY lastSeen DESC
    `,
    hostIds
  ).map(mapCommandPatternRow)
}

function getRow<T extends object>(
  db: Database.Database,
  tableName: string,
  id: string
): T | undefined {
  if (!tableExists(db, tableName)) return undefined
  return db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as T | undefined
}

function selectRows<T extends object>(
  db: Database.Database,
  sql: string,
  params: unknown[] = []
): T[] {
  return db.prepare(sql).all(...params) as T[]
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined
  return row !== undefined
}

function tableHasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return rows.some((row) => row.name === columnName)
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

function pushList(lines: string[], items: string[]): void {
  if (items.length === 0) {
    lines.push('- none')
    return
  }
  for (const item of items) lines.push(`- ${item}`)
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function formatTime(timestamp?: number): string {
  return timestamp === undefined ? '-' : new Date(timestamp).toISOString()
}

export function parseDiagnosticJSON<T>(value: string | undefined, fallback: T): T {
  return parseJSON<T>(value, fallback)
}
