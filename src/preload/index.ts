/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { createTypedIpc } from './typed-ipc'
import type {
  Host,
  Task,
  TaskStep,
  AgentRun,
  AgentPart,
  Approval,
  Artifact,
  Message,
  ModelSettings,
  Provider,
  Model,
  PermissionSettings,
  TerminalSession,
  MemoryEntry,
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory
} from '../shared/types'
import type {
  TopicUpdatedPayload,
  AgentThinkingPayload,
  TerminalCommandStartPayload,
  TerminalCommandEndPayload,
  TerminalControlStatePayload,
  DebugLogEntry,
  SessionRecoveredPayload
} from '../shared/ipc/channels'

const typedIpc = createTypedIpc(ipcRenderer)

// Custom APIs for renderer
const api: Record<string, unknown> = {
  getHosts: () => ipcRenderer.invoke('get-hosts'),
  createHost: (host: Omit<Host, 'id' | 'createdAt'>) => ipcRenderer.invoke('create-host', host),
  deleteHost: (id: string) => ipcRenderer.invoke('delete-host', id),
  getTopics: () => ipcRenderer.invoke('get-topics'),
  createTopic: (title: string, hostIds: string[]) =>
    ipcRenderer.invoke('create-topic', title, hostIds),
  updateTopicTitle: (id: string, title: string) =>
    ipcRenderer.invoke('update-topic-title', id, title),
  deleteTopic: (id: string) => ipcRenderer.invoke('delete-topic', id),
  updateTopicHosts: (id: string, hostIds: string[]) =>
    ipcRenderer.invoke('update-topic-hosts', id, hostIds),
  updateTopicModel: (id: string, providerId: string, modelId: string) =>
    ipcRenderer.invoke('update-topic-model', id, providerId, modelId),
  getMessages: (topicId: string) => ipcRenderer.invoke('get-messages', topicId),
  getTasks: (topicId?: string) => ipcRenderer.invoke('get-tasks', topicId),
  getLatestTask: (topicId: string) => ipcRenderer.invoke('get-latest-task', topicId),
  createTask: (
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ) => ipcRenderer.invoke('create-task', task),
  updateTask: (id: string, updates: Partial<Omit<Task, 'id' | 'topicId' | 'createdAt'>>) =>
    ipcRenderer.invoke('update-task', id, updates),
  getTaskSteps: (taskId: string) => ipcRenderer.invoke('get-task-steps', taskId),
  createTaskStep: (
    step: Omit<TaskStep, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<TaskStep, 'id' | 'createdAt' | 'updatedAt'>>
  ) => ipcRenderer.invoke('create-task-step', step),
  updateTaskStep: (id: string, updates: Partial<Omit<TaskStep, 'id' | 'taskId' | 'createdAt'>>) =>
    ipcRenderer.invoke('update-task-step', id, updates),
  getApprovals: (taskId: string) => ipcRenderer.invoke('get-approvals', taskId),
  createApproval: (
    approval: Omit<Approval, 'id' | 'createdAt'> & Partial<Pick<Approval, 'id' | 'createdAt'>>
  ) => ipcRenderer.invoke('create-approval', approval),
  updateApprovalStatus: (id: string, status: Approval['status']) =>
    ipcRenderer.invoke('update-approval-status', id, status),
  getArtifacts: (taskId: string) => ipcRenderer.invoke('get-artifacts', taskId),
  createArtifact: (
    artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<Artifact, 'id' | 'createdAt' | 'updatedAt'>>
  ) => ipcRenderer.invoke('create-artifact', artifact),
  getMemories: (filters?: { hostId?: string; topicId?: string; includeDisabled?: boolean }) =>
    ipcRenderer.invoke('get-memories', filters),
  createMemory: (
    memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> & Partial<Pick<MemoryEntry, 'scope'>>
  ) => ipcRenderer.invoke('create-memory', memory),
  updateMemory: (
    id: string,
    updates: Partial<
      Pick<
        MemoryEntry,
        'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
      >
    >
  ) => ipcRenderer.invoke('update-memory', id, updates),
  deleteMemory: (id: string) => ipcRenderer.invoke('delete-memory', id),
  getGlobalMemory: () => ipcRenderer.invoke('get-global-memory'),
  importGlobalMemory: (memory: GlobalMemoryData) =>
    ipcRenderer.invoke('import-global-memory', memory),
  clearGlobalMemory: () => ipcRenderer.invoke('clear-global-memory'),
  createGlobalMemoryFact: (fact: {
    content: string
    category?: GlobalMemoryFactCategory | string
    confidence?: number
    source?: string
    sourceError?: string
  }) => ipcRenderer.invoke('create-global-memory-fact', fact),
  updateGlobalMemoryFact: (
    factId: string,
    updates: Partial<Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>>
  ) => ipcRenderer.invoke('update-global-memory-fact', factId, updates),
  deleteGlobalMemoryFact: (factId: string) =>
    ipcRenderer.invoke('delete-global-memory-fact', factId),

  // Host Pool Management
  getTopicHosts: (topicId: string) => ipcRenderer.invoke('agent:get-topic-hosts', topicId),
  addHostToTopic: (topicId: string, hostId: string) =>
    ipcRenderer.invoke('agent:add-host', topicId, hostId),
  removeHostFromTopic: (topicId: string, hostId: string) =>
    ipcRenderer.invoke('agent:remove-host', topicId, hostId),

  // SSH Terminal APIs
  connectSSH: (hostId: string, topicId?: string) =>
    ipcRenderer.invoke('ssh:connect', hostId, topicId),
  sendSSHInput: (id: string, data: string, topicId?: string) =>
    ipcRenderer.send('ssh:input', id, data, topicId),
  resizeSSH: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('ssh:resize', id, cols, rows),

  // Local Terminal APIs
  connectLocal: (topicId: string) => ipcRenderer.invoke('local:connect', topicId),
  sendLocalInput: (id: string, data: string) => ipcRenderer.send('local:input', id, data),
  resizeLocal: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('local:resize', id, cols, rows),
  getLocalBuffer: (id: string) => ipcRenderer.invoke('local:get-buffer', id),
  attachLocal: (id: string) => ipcRenderer.send('local:attach', id),
  closeLocal: (id: string) => ipcRenderer.invoke('local:close', id),
  onSSHData: (id: string, callback: (data: string) => void) => {
    const listener = (_event, data: string) => callback(data)
    ipcRenderer.on(`ssh:data:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:data:${id}`, listener)
  },
  onSSHClosed: (id: string, callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(`ssh:closed:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:closed:${id}`, listener)
  },
  getSSHBuffer: (id: string) => ipcRenderer.invoke('ssh:get-buffer', id),
  attachSSH: (id: string) => ipcRenderer.send('ssh:attach', id),

  // Agent APIs
  sendMessage: (topicId: string, content: string) =>
    ipcRenderer.invoke('agent:message', topicId, content),
  getAgentSessions: (topicId: string) => ipcRenderer.invoke('agent:get-sessions', topicId),
  getAgentRun: (runId: string) => ipcRenderer.invoke('agent:get-run', runId),
  getAgentRunsByTask: (taskId: string) => ipcRenderer.invoke('agent:get-runs-by-task', taskId),
  getAgentRunParts: (runId: string) => ipcRenderer.invoke('agent:get-run-parts', runId),
  getAgentTaskParts: (taskId: string) => ipcRenderer.invoke('agent:get-task-parts', taskId),
  cancelAgentRun: (runId: string) => ipcRenderer.invoke('agent:cancel-run', runId),
  resumeAgentRun: (runId: string) => ipcRenderer.invoke('agent:resume-run', runId),

  // Agent Authorization (HITL)
  onAgentAuthRequest: (
    callback: (
      requestId: string,
      command: string,
      riskLevel?: string,
      reason?: string,
      metadata?: Record<string, unknown>
    ) => void
  ) => {
    const listener = (
      _event,
      payloadOrRequestId:
        | string
        | {
            requestId: string
            command: string
            riskLevel?: string
            reason?: string
            metadata?: Record<string, unknown>
          },
      command?: string,
      riskLevel?: string,
      reason?: string
    ) => {
      if (typeof payloadOrRequestId === 'object') {
        callback(
          payloadOrRequestId.requestId,
          payloadOrRequestId.command,
          payloadOrRequestId.riskLevel,
          payloadOrRequestId.reason,
          payloadOrRequestId.metadata
        )
      } else {
        callback(payloadOrRequestId, command || '', riskLevel, reason)
      }
    }
    ipcRenderer.on('agent:auth-request', listener)
    return () => ipcRenderer.removeListener('agent:auth-request', listener)
  },
  sendAgentAuthResponse: (requestId: string, approved: boolean, alwaysAllow?: boolean) =>
    ipcRenderer.invoke('agent:auth-response', requestId, approved, alwaysAllow),
  onTopicUpdated: (callback: (data: TopicUpdatedPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: TopicUpdatedPayload) => callback(data)
    ipcRenderer.on('topic:updated', listener)
    return () => ipcRenderer.removeListener('topic:updated', listener)
  },
  onAgentThinking: (callback: (data: AgentThinkingPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: AgentThinkingPayload) => callback(data)
    ipcRenderer.on('agent:thinking', listener)
    return () => ipcRenderer.removeListener('agent:thinking', listener)
  },
  onAgentStep: (callback: (step: Message) => void) => {
    const listener = (_event: IpcRendererEvent, step: Message) => callback(step)
    ipcRenderer.on('agent:step', listener)
    return () => ipcRenderer.removeListener('agent:step', listener)
  },
  onAgentRunCreated: (callback: (run: AgentRun) => void) => {
    const listener = (_event: IpcRendererEvent, run: AgentRun) => callback(run)
    ipcRenderer.on('agent:run-created', listener)
    return () => ipcRenderer.removeListener('agent:run-created', listener)
  },
  onAgentRunUpdated: (callback: (run: AgentRun) => void) => {
    const listener = (_event: IpcRendererEvent, run: AgentRun) => callback(run)
    ipcRenderer.on('agent:run-updated', listener)
    return () => ipcRenderer.removeListener('agent:run-updated', listener)
  },
  onAgentPartCreated: (callback: (part: AgentPart) => void) => {
    const listener = (_event: IpcRendererEvent, part: AgentPart) => callback(part)
    ipcRenderer.on('agent:part-created', listener)
    return () => ipcRenderer.removeListener('agent:part-created', listener)
  },
  onAgentPartUpdated: (callback: (part: AgentPart) => void) => {
    const listener = (_event: IpcRendererEvent, part: AgentPart) => callback(part)
    ipcRenderer.on('agent:part-updated', listener)
    return () => ipcRenderer.removeListener('agent:part-updated', listener)
  },
  onAgentToolCall: (
    callback: (data: {
      topicId: string
      taskId: string
      toolName: string
      args: Record<string, unknown>
    }) => void
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { topicId: string; taskId: string; toolName: string; args: Record<string, unknown> }
    ) => callback(data)
    ipcRenderer.on('agent:tool-call', listener)
    return () => ipcRenderer.removeListener('agent:tool-call', listener)
  },
  onAgentToolResult: (
    callback: (data: {
      topicId: string
      taskId: string
      toolName: string
      output: string
      error?: boolean
    }) => void
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { topicId: string; taskId: string; toolName: string; output: string; error?: boolean }
    ) => callback(data)
    ipcRenderer.on('agent:tool-result', listener)
    return () => ipcRenderer.removeListener('agent:tool-result', listener)
  },
  onAgentDoomLoop: (
    callback: (data: {
      topicId: string
      taskId: string
      toolName: string
      callCount: number
    }) => void
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { topicId: string; taskId: string; toolName: string; callCount: number }
    ) => callback(data)
    ipcRenderer.on('agent:doom-loop', listener)
    return () => ipcRenderer.removeListener('agent:doom-loop', listener)
  },
  onAgentTaskComplete: (
    callback: (data: {
      topicId: string
      taskId: string
      status: 'completed' | 'failed'
      summary: string
    }) => void
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { topicId: string; taskId: string; status: 'completed' | 'failed'; summary: string }
    ) => callback(data)
    ipcRenderer.on('agent:task-complete', listener)
    return () => ipcRenderer.removeListener('agent:task-complete', listener)
  },

  onAgentTerminalShow: (callback: (data: TerminalSession) => void) => {
    const listener = (_event: IpcRendererEvent, data: TerminalSession) => callback(data)
    ipcRenderer.on('agent:terminal-show', listener)
    return () => ipcRenderer.removeListener('agent:terminal-show', listener)
  },
  onAgentTerminalHide: (callback: (data: { id: string }) => void) => {
    const listener = (_event: IpcRendererEvent, data: { id: string }) => callback(data)
    ipcRenderer.on('agent:terminal-hide', listener)
    return () => ipcRenderer.removeListener('agent:terminal-hide', listener)
  },
  onAgentSessionCreated: (callback: (data: TerminalSession) => void) => {
    const listener = (_event: IpcRendererEvent, data: TerminalSession) => callback(data)
    ipcRenderer.on('agent:session-created', listener)
    return () => ipcRenderer.removeListener('agent:session-created', listener)
  },
  onAgentSessionClosed: (callback: (data: { id: string }) => void) => {
    const listener = (_event: IpcRendererEvent, data: { id: string }) => callback(data)
    ipcRenderer.on('agent:session-closed', listener)
    return () => ipcRenderer.removeListener('agent:session-closed', listener)
  },

  onTerminalCommandStart: (id: string, callback: (data: TerminalCommandStartPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: TerminalCommandStartPayload) => callback(data)
    ipcRenderer.on(`terminal:command-start:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:command-start:${id}`, listener)
  },

  onTerminalCommandEnd: (id: string, callback: (data: TerminalCommandEndPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: TerminalCommandEndPayload) => callback(data)
    ipcRenderer.on(`terminal:command-end:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:command-end:${id}`, listener)
  },

  createAgentSSHSession: (hostId: string, topicId?: string) =>
    ipcRenderer.invoke('ssh:agent:create', hostId, topicId),
  executeAgentSSHCommand: (id: string, command: string) =>
    ipcRenderer.invoke('ssh:agent:execute', id, command),
  closeAgentSSHSession: (id: string) => ipcRenderer.invoke('ssh:agent:close', id),
  setAgentSessionPaused: (id: string, paused: boolean) =>
    ipcRenderer.invoke('agent:set-session-paused', id, paused),
  isAgentSessionPaused: (id: string) => ipcRenderer.invoke('agent:is-session-paused', id),
  onSSHReady: (id: string, callback: (hostAlias: string) => void) => {
    const listener = (_event, hostAlias: string) => callback(hostAlias)
    ipcRenderer.on(`ssh:ready:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:ready:${id}`, listener)
  },
  onSSHCommand: (id: string, callback: (command: string) => void) => {
    const listener = (_event, command: string) => callback(command)
    ipcRenderer.on(`ssh:command:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:command:${id}`, listener)
  },

  onTerminalAgentExecuting: (id: string, callback: (executing: boolean) => void) => {
    const listener = (_event, executing: boolean) => callback(executing)
    ipcRenderer.on(`terminal:agent-executing:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:agent-executing:${id}`, listener)
  },

  onTerminalUserTakeover: (id: string, callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(`terminal:user-takeover:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:user-takeover:${id}`, listener)
  },
  onTerminalControlState: (id: string, callback: (state: TerminalControlStatePayload) => void) => {
    const listener = (_event: IpcRendererEvent, state: TerminalControlStatePayload) =>
      callback(state)
    ipcRenderer.on(`terminal:control-state:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:control-state:${id}`, listener)
  },

  // Multi-Terminal Management
  createAgentTerminal: (topicId: string, hostId: string, name?: string) =>
    ipcRenderer.invoke('agent:create-terminal', topicId, hostId, name),
  closeAgentTerminal: (id: string) => ipcRenderer.invoke('agent:close-terminal', id),
  renameAgentTerminal: (id: string, name: string) =>
    ipcRenderer.invoke('agent:rename-terminal', id, name),
  toggleTerminalPin: (id: string, isPinned: boolean) =>
    ipcRenderer.invoke('agent:toggle-terminal-pin', id, isPinned),

  getModelSettings: () => ipcRenderer.invoke('get-model-settings'),
  saveModelSettings: (settings: Partial<ModelSettings>) =>
    ipcRenderer.invoke('save-model-settings', settings),

  getProviders: () => ipcRenderer.invoke('get-providers'),
  getProvider: (id: string) => ipcRenderer.invoke('get-provider', id),
  saveProvider: (provider: Provider) => ipcRenderer.invoke('save-provider', provider),
  deleteProvider: (id: string) => ipcRenderer.invoke('delete-provider', id),
  testProviderConnection: (provider: Provider, modelId?: string) =>
    ipcRenderer.invoke('test-provider-connection', provider, modelId),
  fetchProviderModels: (provider: Provider) =>
    ipcRenderer.invoke('fetch-provider-models', provider),

  getModels: (providerId?: string) => ipcRenderer.invoke('get-models', providerId),
  saveModel: (model: Model) => ipcRenderer.invoke('save-model', model),
  deleteModel: (id: string) => ipcRenderer.invoke('delete-model', id),

  // Permission Settings APIs
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  savePermissions: (permissions: Partial<PermissionSettings>) =>
    ipcRenderer.invoke('save-permissions', permissions),
  onDebugLog: (callback: (entry: DebugLogEntry) => void) => {
    const listener = (_event: IpcRendererEvent, entry: DebugLogEntry) => callback(entry)
    ipcRenderer.on('debug:log', listener)
    return () => ipcRenderer.removeListener('debug:log', listener)
  },

  sftpConnect: (hostId: string) => ipcRenderer.invoke('sftp:connect', hostId),
  sftpList: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:list', sessionId, path),
  sftpUpload: (sessionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:upload', sessionId, localPath, remotePath),
  sftpDownload: (sessionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('sftp:download', sessionId, remotePath, localPath),
  sftpMkdir: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:mkdir', sessionId, path),
  sftpDelete: (sessionId: string, path: string) =>
    ipcRenderer.invoke('sftp:delete', sessionId, path),
  sftpClose: (sessionId: string) => ipcRenderer.invoke('sftp:close', sessionId),

  localFsConnect: () => ipcRenderer.invoke('local-fs:connect'),
  localFsList: (sessionId: string, path: string) =>
    ipcRenderer.invoke('local-fs:list', sessionId, path),
  localFsUpload: (sessionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('local-fs:upload', sessionId, localPath, remotePath),
  localFsDownload: (sessionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('local-fs:download', sessionId, remotePath, localPath),
  localFsMkdir: (sessionId: string, path: string) =>
    ipcRenderer.invoke('local-fs:mkdir', sessionId, path),
  localFsDelete: (sessionId: string, itemPath: string) =>
    ipcRenderer.invoke('local-fs:delete', sessionId, itemPath),
  localFsClose: (sessionId: string) => ipcRenderer.invoke('local-fs:close', sessionId),
  startNativeDrag: (filePath: string, iconPath?: string) =>
    ipcRenderer.send('local-fs:start-native-drag', filePath, iconPath),

  sftpTransferBetweenHosts: (
    transferId: string,
    sourceHostId: string,
    sourcePath: string,
    destHostId: string,
    destPath: string
  ) =>
    ipcRenderer.invoke(
      'sftp:transfer-between-hosts',
      transferId,
      sourceHostId,
      sourcePath,
      destHostId,
      destPath
    ),
  onSftpTransferProgress: (
    transferId: string,
    callback: (data: { phase: string; progress: number; transferId: string }) => void
  ) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on(`sftp:transfer-progress:${transferId}`, listener)
    return () => ipcRenderer.removeListener(`sftp:transfer-progress:${transferId}`, listener)
  },

  searchCommands: (query: string, limit?: number) =>
    ipcRenderer.invoke('search-commands', query, limit),

  pfCreate: (hostId: string, localPort: number, remoteHost: string, remotePort: number) =>
    ipcRenderer.invoke('pf:create', hostId, localPort, remoteHost, remotePort),
  pfClose: (tunnelId: string) => ipcRenderer.invoke('pf:close', tunnelId),
  pfList: (hostId?: string) => ipcRenderer.invoke('pf:list', hostId),

  getRecoverableSessions: () => ipcRenderer.invoke('session:get-recoverable'),
  onSessionRecovered: (callback: (data: SessionRecoveredPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: SessionRecoveredPayload) => callback(data)
    ipcRenderer.on('session:recovered', listener)
    return () => ipcRenderer.removeListener('session:recovered', listener)
  }
}

const flatApi = api as Record<string, any>

flatApi.hosts = {
  list: () => typedIpc.invoke('get-hosts'),
  create: (host: Omit<Host, 'id' | 'createdAt'>) => typedIpc.invoke('create-host', host),
  delete: (id: string) => typedIpc.invoke('delete-host', id),
  getTopicHosts: (topicId: string) => typedIpc.invoke('agent:get-topic-hosts', topicId),
  addToTopic: (topicId: string, hostId: string) =>
    typedIpc.invoke('agent:add-host', topicId, hostId),
  removeFromTopic: (topicId: string, hostId: string) =>
    typedIpc.invoke('agent:remove-host', topicId, hostId)
}

flatApi.agent = {
  sendMessage: (topicId: string, content: string) =>
    typedIpc.invoke('agent:message', topicId, content),
  getSessions: (topicId: string) => typedIpc.invoke('agent:get-sessions', topicId),
  getRun: (runId: string) => typedIpc.invoke('agent:get-run', runId),
  getRunsByTask: (taskId: string) => typedIpc.invoke('agent:get-runs-by-task', taskId),
  getRunParts: (runId: string) => typedIpc.invoke('agent:get-run-parts', runId),
  getTaskParts: (taskId: string) => typedIpc.invoke('agent:get-task-parts', taskId),
  cancelRun: (runId: string) => typedIpc.invoke('agent:cancel-run', runId),
  resumeRun: (runId: string) => typedIpc.invoke('agent:resume-run', runId),
  sendAuthResponse: (requestId: string, approved: boolean, alwaysAllow?: boolean) =>
    typedIpc.invoke('agent:auth-response', requestId, approved, alwaysAllow),
  onRunCreated: flatApi.onAgentRunCreated,
  onRunUpdated: flatApi.onAgentRunUpdated,
  onPartCreated: flatApi.onAgentPartCreated,
  onPartUpdated: flatApi.onAgentPartUpdated,
  onStep: flatApi.onAgentStep,
  onThinking: flatApi.onAgentThinking,
  onAuthRequest: flatApi.onAgentAuthRequest,
  onTaskComplete: flatApi.onAgentTaskComplete
}

flatApi.terminal = {
  connectSSH: (hostId: string, topicId?: string) => typedIpc.invoke('ssh:connect', hostId, topicId),
  sendSSHInput: (id: string, data: string, topicId?: string) =>
    typedIpc.send('ssh:input', id, data, topicId),
  resizeSSH: (id: string, cols: number, rows: number) =>
    typedIpc.send('ssh:resize', id, cols, rows),
  getSSHBuffer: (id: string) => typedIpc.invoke('ssh:get-buffer', id),
  attachSSH: (id: string) => typedIpc.send('ssh:attach', id),
  connectLocal: (topicId: string) => typedIpc.invoke('local:connect', topicId),
  sendLocalInput: (id: string, data: string) => typedIpc.send('local:input', id, data),
  resizeLocal: (id: string, cols: number, rows: number) =>
    typedIpc.send('local:resize', id, cols, rows),
  getLocalBuffer: (id: string) => typedIpc.invoke('local:get-buffer', id),
  attachLocal: (id: string) => typedIpc.send('local:attach', id),
  closeLocal: (id: string) => typedIpc.invoke('local:close', id),
  createAgentTerminal: flatApi.createAgentTerminal,
  closeAgentTerminal: flatApi.closeAgentTerminal,
  renameAgentTerminal: flatApi.renameAgentTerminal,
  toggleTerminalPin: flatApi.toggleTerminalPin,
  onCommandStart: flatApi.onTerminalCommandStart,
  onCommandEnd: flatApi.onTerminalCommandEnd,
  onSSHData: flatApi.onSSHData,
  onSSHClosed: flatApi.onSSHClosed
}

flatApi.settings = {
  getModelSettings: () => typedIpc.invoke('get-model-settings'),
  saveModelSettings: (settings: Partial<ModelSettings>) =>
    typedIpc.invoke('save-model-settings', settings),
  getProviders: () => typedIpc.invoke('get-providers'),
  getProvider: (id: string) => typedIpc.invoke('get-provider', id),
  saveProvider: (provider: Provider) => typedIpc.invoke('save-provider', provider),
  deleteProvider: (id: string) => typedIpc.invoke('delete-provider', id),
  testProviderConnection: (provider: Provider, modelId?: string) =>
    typedIpc.invoke('test-provider-connection', provider, modelId),
  fetchProviderModels: (provider: Provider) => typedIpc.invoke('fetch-provider-models', provider),
  getModels: (providerId?: string) => typedIpc.invoke('get-models', providerId),
  saveModel: (model: Model) => typedIpc.invoke('save-model', model),
  deleteModel: (id: string) => typedIpc.invoke('delete-model', id),
  getPermissions: () => typedIpc.invoke('get-permissions'),
  savePermissions: (permissions: Partial<PermissionSettings>) =>
    typedIpc.invoke('save-permissions', permissions)
}

flatApi.files = {
  sftpConnect: flatApi.sftpConnect,
  sftpList: flatApi.sftpList,
  sftpUpload: flatApi.sftpUpload,
  sftpDownload: flatApi.sftpDownload,
  sftpMkdir: flatApi.sftpMkdir,
  sftpDelete: flatApi.sftpDelete,
  sftpClose: flatApi.sftpClose,
  localFsConnect: flatApi.localFsConnect,
  localFsList: flatApi.localFsList,
  localFsUpload: flatApi.localFsUpload,
  localFsDownload: flatApi.localFsDownload,
  localFsMkdir: flatApi.localFsMkdir,
  localFsDelete: flatApi.localFsDelete,
  localFsClose: flatApi.localFsClose,
  startNativeDrag: flatApi.startNativeDrag,
  transferBetweenHosts: flatApi.sftpTransferBetweenHosts,
  onTransferProgress: flatApi.onSftpTransferProgress
}

flatApi.memories = {
  list: (filters?: { hostId?: string; topicId?: string; includeDisabled?: boolean }) =>
    typedIpc.invoke('get-memories', filters),
  create: (
    memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> & Partial<Pick<MemoryEntry, 'scope'>>
  ) => typedIpc.invoke('create-memory', memory),
  update: (
    id: string,
    updates: Partial<
      Pick<
        MemoryEntry,
        'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
      >
    >
  ) => typedIpc.invoke('update-memory', id, updates),
  delete: (id: string) => typedIpc.invoke('delete-memory', id),
  getGlobal: () => typedIpc.invoke('get-global-memory'),
  importGlobal: (memory: GlobalMemoryData) => typedIpc.invoke('import-global-memory', memory),
  clearGlobal: () => typedIpc.invoke('clear-global-memory'),
  createGlobalFact: (fact: {
    content: string
    category?: GlobalMemoryFactCategory | string
    confidence?: number
    source?: string
    sourceError?: string
  }) => typedIpc.invoke('create-global-memory-fact', fact),
  updateGlobalFact: (
    factId: string,
    updates: Partial<Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>>
  ) => typedIpc.invoke('update-global-memory-fact', factId, updates),
  deleteGlobalFact: (factId: string) => typedIpc.invoke('delete-global-memory-fact', factId)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export {}
