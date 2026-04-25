import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { AgentService } from './agent'
import {
  agentPartDB,
  agentRunDB,
  approvalDB,
  artifactDB,
  globalMemoryDB,
  hostDB,
  memoryDB,
  modelDB,
  modelSettingsDB,
  permissionDB,
  providerDB,
  taskDB,
  taskStepDB,
  terminalIODB,
  terminalSessionDB,
  topicDB
} from './db'
import { getDatabase } from './db/connection'
import {
  closeLocalSession,
  getLocalSessionBuffer,
  resizeLocalTerminal,
  sendLocalInput
} from './local-terminal'
import { closeSession, getTerminalBuffer, resizeSSHSession, sendSSHInput } from './ssh'
import {
  closeSFTPSession,
  createDirectory,
  createSFTPSession,
  deleteItem,
  downloadFile,
  listDirectory,
  transferBetweenHosts,
  uploadFile
} from './sftp'
import { createForwardTunnel, closeTunnel, listTunnels } from './port-forward'
import { commandExecutor } from './terminal'
import { logger } from './logger'
import { fetchProviderModels, testProviderConnection } from './ai'
import { getRecoverableSessions } from './session-recovery'
import {
  getCliControlSocketPath,
  type CliControlRequest,
  type CliControlResponse
} from './cli-control-protocol'
import type { Topic } from '../shared/types'

let server: net.Server | null = null

export function startCliControlServer(agentService: AgentService): void {
  if (server) return

  const socketPath = getCliControlSocketPath()
  if (process.platform !== 'win32') {
    fs.mkdirSync(path.dirname(socketPath), { recursive: true })
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath)
  }

  server = net.createServer((socket) => {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) void handleLine(agentService, socket, line)
        newlineIndex = buffer.indexOf('\n')
      }
    })
  })

  server.on('error', (error) => {
    logger.warn('CliControl', `Failed to start CLI control server: ${error.message}`)
    server = null
  })

  server.listen(socketPath, () => {
    logger.info('CliControl', `CLI control server listening at ${socketPath}`)
  })
}

export function stopCliControlServer(): void {
  server?.close()
  server = null
}

async function handleLine(
  agentService: AgentService,
  socket: net.Socket,
  line: string
): Promise<void> {
  let request: CliControlRequest
  try {
    request = JSON.parse(line) as CliControlRequest
  } catch (error) {
    writeResponse(socket, { id: 'unknown', ok: false, error: getErrorMessage(error) })
    return
  }

  try {
    if (request.command === 'debug.logs.follow') {
      handleDebugLogStream(socket, request)
      return
    }
    const result = await handleRequest(agentService, request)
    writeResponse(socket, { id: request.id, ok: true, data: result, result })
  } catch (error) {
    writeResponse(socket, { id: request.id, ok: false, error: getErrorMessage(error) })
  }
}

async function handleRequest(
  agentService: AgentService,
  request: CliControlRequest
): Promise<unknown> {
  const args = request.args ?? {}
  switch (request.command) {
    case 'ping':
      return { ok: true }
    case 'app.status':
      return {
        ok: true,
        socketPath: getCliControlSocketPath(),
        protocolVersion: 1,
        databaseOpen: Boolean(getDatabase())
      }
    case 'hosts.list':
      return hostDB.getHosts()
    case 'hosts.show':
      return hostDB.getHostById(readString(args, 'id'))
    case 'hosts.create':
      return hostDB.createHost(readObject(args, 'host') as Parameters<typeof hostDB.createHost>[0])
    case 'hosts.delete':
      hostDB.deleteHost(readString(args, 'id'))
      return { ok: true }
    case 'topics.create':
      return notifyTopicUpdated(
        agentService,
        topicDB.createTopic(readString(args, 'title'), readStringArray(args, 'hostIds', ['local']))
      )
    case 'topics.rename': {
      const topicId = resolveTopicId(readString(args, 'id'))
      topicDB.updateTopicTitle(topicId, readString(args, 'title'))
      return notifyTopicUpdated(agentService, topicDB.getTopicById(topicId))
    }
    case 'topics.delete': {
      const topicId = resolveTopicId(readString(args, 'id'))
      topicDB.deleteTopic(topicId)
      agentService.notifyTopicUpdated({ topicId, deleted: true })
      return { ok: true }
    }
    case 'topics.model.set': {
      const topicId = resolveTopicId(readString(args, 'id'))
      topicDB.updateTopicModel(topicId, readString(args, 'providerId'), readString(args, 'modelId'))
      return notifyTopicUpdated(agentService, topicDB.getTopicById(topicId))
    }
    case 'topics.hosts.list':
      return agentService.getTopicHosts(resolveTopicId(readString(args, 'topicId')))
    case 'topics.hosts.add': {
      const topicId = resolveTopicId(readString(args, 'topicId'))
      await agentService.addHostToTopic(topicId, readString(args, 'hostId'))
      return notifyTopicUpdated(agentService, topicDB.getTopicById(topicId))
    }
    case 'topics.hosts.remove': {
      const topicId = resolveTopicId(readString(args, 'topicId'))
      await agentService.removeHostFromTopic(topicId, readString(args, 'hostId'))
      return notifyTopicUpdated(agentService, topicDB.getTopicById(topicId))
    }
    case 'topics.hosts.set': {
      const topicId = resolveTopicId(readString(args, 'topicId'))
      topicDB.updateTopicHosts(topicId, readStringArray(args, 'hostIds'))
      return notifyTopicUpdated(agentService, topicDB.getTopicById(topicId))
    }
    case 'chat.send': {
      const content = readString(args, 'content')
      const topicId = getOrCreateTopicId(args, agentService)
      return agentService.handleMessage(topicId, content)
    }
    case 'runs.list':
      return listRuns(args)
    case 'runs.show':
      return agentRunDB.getRun(resolveRunId(readString(args, 'id')))
    case 'runs.parts':
      return agentPartDB.getPartsByRun(resolveRunId(readString(args, 'id')))
    case 'runs.cancel':
      return agentService.cancelRun(resolveRunId(readString(args, 'id')))
    case 'runs.resume':
      return agentService.resumeRun(resolveRunId(readString(args, 'id')))
    case 'approvals.list':
      return listApprovals(args)
    case 'approvals.show':
      return getApprovalById(readString(args, 'id'))
    case 'approvals.approve': {
      const id = readString(args, 'id')
      const approval = approvalDB.updateApprovalStatus(id, 'approved')
      await agentService.handleAuthResponse(id, true, readBoolean(args, 'alwaysAllow', false))
      return approval ?? { ok: true }
    }
    case 'approvals.reject': {
      const id = readString(args, 'id')
      const approval = approvalDB.updateApprovalStatus(id, 'rejected')
      await agentService.handleAuthResponse(id, false, false)
      return approval ?? { ok: true }
    }
    case 'tasks.list':
      return listTasks(args)
    case 'tasks.show':
      return taskDB.getTaskById(resolveTaskId(readString(args, 'id')))
    case 'tasks.steps':
      return taskStepDB.getTaskSteps(resolveTaskId(readString(args, 'id')))
    case 'artifacts.list':
      return listArtifacts(args)
    case 'artifacts.show':
      return getArtifactById(readString(args, 'id'))
    case 'terminal.list': {
      const topicIds = getTopicIds(args.topicId)
      const groups = await Promise.all(
        topicIds.map(async (topicId) => ({
          topicId,
          sessions: await agentService.getSessions(topicId)
        }))
      )
      return groups.flatMap((group) => group.sessions)
    }
    case 'terminal.count': {
      const topicIds = getTopicIds(args.topicId)
      const groups = await Promise.all(topicIds.map((topicId) => agentService.getSessions(topicId)))
      const sessions = groups.flat()
      return {
        total: sessions.length,
        byStatus: sessions.reduce<Record<string, number>>((acc, session) => {
          acc[session.status] = (acc[session.status] ?? 0) + 1
          return acc
        }, {})
      }
    }
    case 'terminal.output': {
      const sessionId = resolveSessionId(args)
      const session = terminalSessionDB.getSessionById(sessionId)
      return {
        session,
        buffer:
          session?.hostId === 'local'
            ? getLocalSessionBuffer(sessionId)
            : getTerminalBuffer(sessionId)
      }
    }
    case 'terminal.open': {
      const topicId = resolveTopicId(readString(args, 'topicId'))
      return agentService.createTerminal(
        topicId,
        readString(args, 'hostId'),
        readOptionalString(args, 'terminalName'),
        {
          role:
            (readOptionalString(args, 'role') as 'agent_command' | 'interactive' | 'user') ?? 'user'
        }
      )
    }
    case 'terminal.input': {
      const sessionId = resolveSessionId(args)
      const session = terminalSessionDB.getSessionById(sessionId)
      const data = readString(args, 'data')
      if (session?.hostId === 'local') sendLocalInput(sessionId, data, true)
      else if (
        !sendSSHInput(sessionId, data, readOptionalString(args, 'topicId') ?? session?.topicId)
      ) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      return { ok: true, sessionId }
    }
    case 'terminal.resize': {
      const sessionId = resolveSessionId(args)
      const session = terminalSessionDB.getSessionById(sessionId)
      const cols = readNumber(args, 'cols')
      const rows = readNumber(args, 'rows')
      if (session?.hostId === 'local') resizeLocalTerminal(sessionId, cols, rows)
      else if (!resizeSSHSession(sessionId, cols, rows))
        throw new Error(`Session not found: ${sessionId}`)
      return { ok: true, sessionId, cols, rows }
    }
    case 'terminal.attach': {
      const sessionId = resolveSessionId(args)
      const session = terminalSessionDB.getSessionById(sessionId)
      return {
        session,
        buffer:
          session?.hostId === 'local'
            ? getLocalSessionBuffer(sessionId)
            : getTerminalBuffer(sessionId)
      }
    }
    case 'terminal.close': {
      const sessionId = resolveSessionId(args)
      const session = terminalSessionDB.getSessionById(sessionId)
      if (session?.hostId === 'local') closeLocalSession(sessionId)
      else closeSession(sessionId)
      await agentService.closeTerminal(sessionId).catch(() => undefined)
      return { ok: true, sessionId }
    }
    case 'terminal.rename':
      await agentService.renameTerminal(resolveSessionId(args), readString(args, 'terminalName'))
      terminalSessionDB.updateSessionName(resolveSessionId(args), readString(args, 'terminalName'))
      return terminalSessionDB.getSessionById(resolveSessionId(args))
    case 'terminal.pin':
      await agentService.toggleTerminalPin(
        resolveSessionId(args),
        readBoolean(args, 'isPinned', true)
      )
      return {
        ok: true,
        sessionId: resolveSessionId(args),
        isPinned: readBoolean(args, 'isPinned', true)
      }
    case 'terminal.pause':
      await agentService.setPaused(resolveSessionId(args), readBoolean(args, 'paused', true))
      return {
        ok: true,
        sessionId: resolveSessionId(args),
        paused: readBoolean(args, 'paused', true)
      }
    case 'terminal.execute':
      return commandExecutor.executeAgentCommand(
        resolveSessionId(args),
        readString(args, 'command'),
        readOptionalString(args, 'topicId') ??
          terminalSessionDB.getSessionById(resolveSessionId(args))?.topicId ??
          '',
        readOptionalString(args, 'taskId'),
        readOptionalString(args, 'stepId'),
        { timeoutMs: readOptionalNumber(args, 'timeoutMs') }
      )
    case 'files.sftp.connect': {
      const sessionId = await createSFTPSession(readString(args, 'hostId'))
      return { sessionId, hostId: readString(args, 'hostId') }
    }
    case 'files.sftp.ls':
      return listDirectory(readString(args, 'sessionId'), readString(args, 'path'))
    case 'files.sftp.upload':
      await uploadFile(
        readString(args, 'sessionId'),
        readString(args, 'source'),
        readString(args, 'dest')
      )
      return { ok: true }
    case 'files.sftp.download':
      await downloadFile(
        readString(args, 'sessionId'),
        readString(args, 'source'),
        readString(args, 'dest')
      )
      return { ok: true }
    case 'files.sftp.mkdir':
      await createDirectory(readString(args, 'sessionId'), readString(args, 'path'))
      return { ok: true }
    case 'files.sftp.rm':
      await deleteItem(readString(args, 'sessionId'), readString(args, 'path'))
      return { ok: true }
    case 'files.sftp.close':
      closeSFTPSession(readString(args, 'sessionId'))
      return { ok: true }
    case 'files.transfer.start':
      await transferBetweenHosts(
        readString(args, 'sourceHostId'),
        readString(args, 'sourcePath'),
        readString(args, 'destHostId'),
        readString(args, 'destPath'),
        readString(args, 'transferId'),
        {
          sender: {
            send: (_channel: string, data: unknown) =>
              logger.info('CliControl', 'transfer progress', data)
          }
        } as Electron.IpcMainInvokeEvent
      )
      return { ok: true, transferId: readString(args, 'transferId') }
    case 'pf.list':
      return listTunnels(readOptionalString(args, 'hostId')).map(formatTunnel)
    case 'pf.create':
      return formatTunnel(
        await createForwardTunnel(
          readString(args, 'hostId'),
          readNumber(args, 'localPort'),
          readString(args, 'remoteHost'),
          readNumber(args, 'remotePort')
        )
      )
    case 'pf.close':
      return { ok: closeTunnel(readString(args, 'id')) }
    case 'settings.providers.list':
      return providerDB.getProviders()
    case 'settings.providers.show':
      return providerDB.getProviderById(readString(args, 'id'))
    case 'settings.providers.save':
      providerDB.saveProvider(
        readObject(args, 'provider') as unknown as Parameters<typeof providerDB.saveProvider>[0]
      )
      return providerDB.getProviderById((readObject(args, 'provider') as { id: string }).id)
    case 'settings.providers.delete':
      providerDB.deleteProvider(readString(args, 'id'))
      return { ok: true }
    case 'settings.providers.test': {
      const provider = getProviderInput(args)
      return testProviderConnection(provider, readOptionalString(args, 'modelId'))
    }
    case 'settings.providers.fetch.models': {
      const provider = getProviderInput(args)
      return fetchProviderModels(provider)
    }
    case 'settings.models.list':
      return modelDB.getModels(readOptionalString(args, 'providerId'))
    case 'settings.models.show':
      return modelDB.getModelById(readString(args, 'id'))
    case 'settings.models.save':
      modelDB.saveModel(
        readObject(args, 'model') as unknown as Parameters<typeof modelDB.saveModel>[0]
      )
      return modelDB.getModelById((readObject(args, 'model') as { id: string }).id)
    case 'settings.models.delete':
      modelDB.deleteModel(readString(args, 'id'))
      return { ok: true }
    case 'settings.permissions.get':
      return permissionDB.getPermissions()
    case 'settings.permissions.set':
      permissionDB.savePermissions(
        readObject(args, 'permissions') as Partial<ReturnType<typeof permissionDB.getPermissions>>
      )
      return permissionDB.getPermissions()
    case 'settings.model.settings.get':
      return modelSettingsDB.getSettings()
    case 'settings.model.settings.save':
      modelSettingsDB.saveSettings(
        readObject(args, 'settings') as Parameters<typeof modelSettingsDB.saveSettings>[0]
      )
      return modelSettingsDB.getSettings()
    case 'memory.list':
      return memoryDB.getMemories({
        hostId: readOptionalString(args, 'hostId'),
        topicId: readOptionalString(args, 'topicId'),
        includeDisabled: readBoolean(args, 'includeDisabled', false)
      })
    case 'memory.create':
      return memoryDB.createMemory(
        readObject(args, 'memory') as Parameters<typeof memoryDB.createMemory>[0]
      )
    case 'memory.update':
      return memoryDB.updateMemory(
        readString(args, 'id'),
        readObject(args, 'updates') as Parameters<typeof memoryDB.updateMemory>[1]
      )
    case 'memory.delete':
      memoryDB.deleteMemory(readString(args, 'id'))
      return { ok: true }
    case 'memory.global.get':
      return globalMemoryDB.getMemory()
    case 'memory.global.import':
      return globalMemoryDB.importMemory(
        readObject(args, 'memory') as unknown as Parameters<typeof globalMemoryDB.importMemory>[0]
      )
    case 'memory.global.clear':
      return globalMemoryDB.clearMemory()
    case 'memory.global.fact.create':
      return globalMemoryDB.createFact(
        readObject(args, 'fact') as Parameters<typeof globalMemoryDB.createFact>[0]
      )
    case 'memory.global.fact.update':
      return globalMemoryDB.updateFact(
        readString(args, 'id'),
        readObject(args, 'updates') as Parameters<typeof globalMemoryDB.updateFact>[1]
      )
    case 'memory.global.fact.delete':
      return globalMemoryDB.deleteFact(readString(args, 'id'))
    case 'history.search':
      return terminalIODB.searchCommandInputs(
        readString(args, 'query'),
        readOptionalNumber(args, 'limit') ?? 20
      )
    case 'sessions.recoverable':
      return getRecoverableSessions()
    default:
      throw new Error(`Unknown CLI control command: ${request.command}`)
  }
}

function writeResponse(socket: net.Socket, response: CliControlResponse): void {
  socket.write(`${JSON.stringify(response)}\n`)
}

function handleDebugLogStream(socket: net.Socket, request: CliControlRequest): void {
  const level =
    typeof request.args?.level === 'string' ? request.args.level.toUpperCase() : undefined
  const stop = logger.onLog((entry) => {
    if (level && entry.level !== level) return
    socket.write(
      `${JSON.stringify({ id: request.id, ok: true, event: 'debug.log', data: entry })}\n`
    )
  })
  socket.write(
    `${JSON.stringify({
      id: request.id,
      ok: true,
      event: 'debug.started',
      data: { socketPath: getCliControlSocketPath() }
    })}\n`
  )
  socket.on('close', stop)
  socket.on('error', stop)
}

function resolveTopicId(input: string): string {
  if (input !== 'latest') return input
  const latest = topicDB.getTopics()[0]
  if (!latest) throw new Error('No topic found')
  return latest.id
}

function resolveRunId(input: string): string {
  if (input !== 'latest') return input
  const latest = listRuns({ limit: 1 })[0] as { id?: string } | undefined
  if (!latest) throw new Error('No run found')
  if (!latest.id) throw new Error('No run found')
  return latest.id
}

function resolveTaskId(input: string): string {
  if (input !== 'latest') return input
  const latest = taskDB.getTasks()[0]
  if (!latest) throw new Error('No task found')
  return latest.id
}

function listRuns(args: Record<string, unknown>): unknown[] {
  const db = getDatabase()
  const params: unknown[] = []
  const where: string[] = ['1 = 1']
  const topic = readOptionalString(args, 'topic')
  const task = readOptionalString(args, 'task')
  const status = readOptionalString(args, 'status')
  if (topic) {
    where.push('topicId = ?')
    params.push(resolveTopicId(topic))
  }
  if (task) {
    where.push('taskId = ?')
    params.push(resolveTaskId(task))
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  params.push(readOptionalNumber(args, 'limit') ?? 20)
  const rows = db
    .prepare(
      `SELECT * FROM agent_runs WHERE ${where.join(' AND ')} ORDER BY updatedAt DESC LIMIT ?`
    )
    .all(...params)
  return rows.map((row) => agentRunDB.getRun((row as { id: string }).id)).filter(Boolean)
}

function listApprovals(args: Record<string, unknown>): unknown[] {
  const db = getDatabase()
  const params: unknown[] = []
  const where: string[] = ['1 = 1']
  const task = readOptionalString(args, 'task')
  const status = readOptionalString(args, 'status')
  if (task) {
    where.push('taskId = ?')
    params.push(resolveTaskId(task))
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  params.push(readOptionalNumber(args, 'limit') ?? 50)
  return db
    .prepare(
      `SELECT id FROM approvals WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`
    )
    .all(...params)
    .map((row) => getApprovalById((row as { id: string }).id))
    .filter(Boolean)
}

function listTasks(args: Record<string, unknown>): unknown[] {
  const topic = readOptionalString(args, 'topic')
  const status = readOptionalString(args, 'status')
  return taskDB
    .getTasks(topic ? resolveTopicId(topic) : undefined)
    .filter((task) => !status || task.status === status)
    .slice(0, readOptionalNumber(args, 'limit') ?? 20)
}

function listArtifacts(args: Record<string, unknown>): unknown[] {
  const db = getDatabase()
  const task = readOptionalString(args, 'task')
  if (task) return artifactDB.getArtifactsByTaskId(resolveTaskId(task))
  return db
    .prepare('SELECT id FROM artifacts ORDER BY createdAt DESC LIMIT ?')
    .all(readOptionalNumber(args, 'limit') ?? 50)
    .map((row) => getArtifactById((row as { id: string }).id))
    .filter(Boolean)
}

function getApprovalById(id: string): unknown | undefined {
  const db = getDatabase()
  const row =
    id === 'latest'
      ? (db.prepare('SELECT id, taskId FROM approvals ORDER BY createdAt DESC LIMIT 1').get() as
          | { id: string; taskId: string }
          | undefined)
      : (db.prepare('SELECT id, taskId FROM approvals WHERE id = ?').get(id) as
          | { id: string; taskId: string }
          | undefined)
  if (!row) return undefined
  return approvalDB.getApprovalsByTaskId(row.taskId).find((approval) => approval.id === row.id)
}

function getArtifactById(id: string): unknown | undefined {
  const db = getDatabase()
  const row =
    id === 'latest'
      ? (db.prepare('SELECT id, taskId FROM artifacts ORDER BY createdAt DESC LIMIT 1').get() as
          | { id: string; taskId: string }
          | undefined)
      : (db.prepare('SELECT id, taskId FROM artifacts WHERE id = ?').get(id) as
          | { id: string; taskId: string }
          | undefined)
  if (!row) return undefined
  return artifactDB.getArtifactsByTaskId(row.taskId).find((artifact) => artifact.id === row.id)
}

function getProviderInput(
  args: Record<string, unknown>
): Parameters<typeof testProviderConnection>[0] {
  const direct = args.provider
  if (typeof direct === 'object' && direct)
    return direct as Parameters<typeof testProviderConnection>[0]
  const id = readString(args, 'id')
  const provider = providerDB.getProviderById(id)
  if (!provider) throw new Error(`Provider not found: ${id}`)
  return provider
}

function formatTunnel(tunnel: {
  id: string
  hostId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: string
  createdAt: number
}): {
  id: string
  hostId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: string
  createdAt: number
} {
  return {
    id: tunnel.id,
    hostId: tunnel.hostId,
    localPort: tunnel.localPort,
    remoteHost: tunnel.remoteHost,
    remotePort: tunnel.remotePort,
    status: tunnel.status,
    createdAt: tunnel.createdAt
  }
}

function getTopicIds(topicIdInput: unknown): string[] {
  if (typeof topicIdInput === 'string' && topicIdInput.length > 0) {
    if (topicIdInput !== 'latest') return [topicIdInput]
    const latest = topicDB.getTopics()[0]
    return latest ? [latest.id] : []
  }
  return topicDB.getTopics().map((topic) => topic.id)
}

function notifyTopicUpdated<T extends Topic | undefined | null>(
  agentService: AgentService,
  topic: T
): T {
  if (topic) {
    agentService.notifyTopicUpdated({ topicId: topic.id, title: topic.title, topic })
  }
  return topic
}

function getOrCreateTopicId(args: Record<string, unknown>, agentService: AgentService): string {
  const topicId = typeof args.topicId === 'string' ? args.topicId : undefined
  if (topicId && topicId !== 'latest') return topicId
  if (topicId === 'latest') {
    const latest = topicDB.getTopics()[0]
    if (latest) return latest.id
  }

  const content = readString(args, 'content')
  const title =
    typeof args.title === 'string' && args.title.trim()
      ? args.title.trim()
      : content.replace(/\s+/g, ' ').trim().slice(0, 30)
  const hostIds = Array.isArray(args.hostIds)
    ? args.hostIds.filter((hostId): hostId is string => typeof hostId === 'string')
    : ['local']
  const topic = topicDB.createTopic(title, hostIds.length > 0 ? hostIds : ['local'])
  notifyTopicUpdated(agentService, topic)
  return topic.id
}

function resolveSessionId(args: Record<string, unknown>): string {
  const sessionId = readString(args, 'sessionId')
  if (sessionId !== 'latest') return sessionId

  const topicIds = getTopicIds(args.topicId)
  const session =
    topicIds.length > 0
      ? terminalSessionDB.getActiveSessionsByTopic(topicIds[0])[0]
      : terminalSessionDB.getActiveSessions()[0]
  if (!session) throw new Error('No active terminal session found')
  return session.id
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${key}`)
  return value
}

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error(`Missing ${key}`)
}

function readOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readBoolean(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  return fallback
}

function readStringArray(
  args: Record<string, unknown>,
  key: string,
  fallback: string[] = []
): string[] {
  const value = args[key]
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function readObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Missing ${key}`)
  }
  return value as Record<string, unknown>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
