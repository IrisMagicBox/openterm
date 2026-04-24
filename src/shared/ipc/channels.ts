import type {
  Host,
  Topic,
  Message,
  Task,
  TaskStep,
  AgentRun,
  AgentPart,
  Approval,
  ApprovalStatus,
  Artifact,
  ModelSettings,
  Provider,
  Model,
  PermissionSettings,
  TerminalSession,
  TerminalSessionStatus,
  TerminalTakeoverMode,
  MemoryEntry,
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory
} from '../types'

export interface SSHAgentExecuteResult {
  content: string
  exitCode: number
  durationMs: number
}

export interface ProviderConnectionTestResult {
  ok: boolean
  message: string
}

export interface SFTPFileEntry {
  name: string
  type: 'directory' | 'file'
  size: number
  modifyTime: number
  permissions: number
}

export interface SFTPConnectResult {
  sessionId: string
  hostId: string
}

export interface CommandSearchResult {
  content: string
  source: string
  hostId: string
  timestamp: number
}

export interface PortForwardTunnel {
  id: string
  hostId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: string
  createdAt: number
}

export interface RecoverableSession {
  id: string
  topicId: string
  hostId: string
  hostAlias: string
  status: TerminalSessionStatus
  name?: string
  createdAt: number
}

export interface SessionRecoveredPayload {
  recovered: Array<{
    originalId: string
    newSessionId: string
    hostAlias: string
    topicId: string
  }>
  failed: Array<{
    hostAlias: string
    topicId: string
  }>
}

export interface TerminalCommandStartPayload {
  inputId: string
  command: string
  source: 'agent' | 'user'
}

export interface TerminalCommandEndPayload {
  inputId: string
  outputId: string
  exitCode: number
  durationMs: number
  isTruncated: boolean
  cwd?: string
}

export interface TerminalControlStatePayload {
  lockedBy: 'agent' | 'user' | null
  takeoverMode: TerminalTakeoverMode | null
  paused: boolean
}

export interface DebugLogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  timestamp: number
  category: string
  message: string
  data?: unknown
}

export interface AgentAuthRequestPayload {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export interface AgentThinkingPayload {
  topicId: string
  thinking: boolean
  taskId?: string
}

export interface TopicUpdatedPayload {
  topicId: string
  title: string
}

export interface HostUpdatedPayload {
  hostId: string
  alias?: string
  tags?: string[]
}

export interface IpcInvokeChannels {
  'get-hosts': { payload: void; result: Host[] }
  'create-host': { payload: [host: Omit<Host, 'id' | 'createdAt'>]; result: Host }
  'delete-host': { payload: [id: string]; result: void }

  'get-topics': { payload: void; result: Topic[] }
  'create-topic': { payload: [title: string, hostIds: string[]]; result: Topic }
  'update-topic-title': { payload: [topicId: string, title: string]; result: void }
  'delete-topic': { payload: [topicId: string]; result: void }
  'update-topic-hosts': { payload: [topicId: string, hostIds: string[]]; result: void }

  'get-messages': { payload: [topicId: string]; result: Message[] }

  'get-tasks': { payload: [topicId?: string]; result: Task[] }
  'get-latest-task': { payload: [topicId: string]; result: Task | undefined }
  'create-task': {
    payload: [
      task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>>
    ]
    result: Task
  }
  'update-task': {
    payload: [id: string, updates: Partial<Omit<Task, 'id' | 'topicId' | 'createdAt'>>]
    result: Task | undefined
  }

  'get-task-steps': { payload: [taskId: string]; result: TaskStep[] }
  'create-task-step': {
    payload: [
      step: Omit<TaskStep, 'id' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<TaskStep, 'id' | 'createdAt' | 'updatedAt'>>
    ]
    result: TaskStep
  }
  'update-task-step': {
    payload: [id: string, updates: Partial<Omit<TaskStep, 'id' | 'taskId' | 'createdAt'>>]
    result: TaskStep | undefined
  }

  'get-approvals': { payload: [taskId: string]; result: Approval[] }
  'create-approval': {
    payload: [
      approval: Omit<Approval, 'id' | 'createdAt'> & Partial<Pick<Approval, 'id' | 'createdAt'>>
    ]
    result: Approval
  }
  'update-approval-status': {
    payload: [id: string, status: ApprovalStatus]
    result: Approval | undefined
  }

  'get-artifacts': { payload: [taskId: string]; result: Artifact[] }
  'create-artifact': {
    payload: [
      artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<Artifact, 'id' | 'createdAt' | 'updatedAt'>>
    ]
    result: Artifact
  }

  'get-memories': {
    payload: [filters?: { hostId?: string; topicId?: string; includeDisabled?: boolean }]
    result: MemoryEntry[]
  }
  'create-memory': {
    payload: [
      memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> & Partial<Pick<MemoryEntry, 'scope'>>
    ]
    result: MemoryEntry
  }
  'update-memory': {
    payload: [
      id: string,
      updates: Partial<
        Pick<
          MemoryEntry,
          'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
        >
      >
    ]
    result: MemoryEntry | undefined
  }
  'delete-memory': { payload: [id: string]; result: void }

  'get-global-memory': { payload: void; result: GlobalMemoryData }
  'import-global-memory': { payload: [memory: GlobalMemoryData]; result: GlobalMemoryData }
  'clear-global-memory': { payload: void; result: GlobalMemoryData }
  'create-global-memory-fact': {
    payload: [
      fact: {
        content: string
        category?: GlobalMemoryFactCategory | string
        confidence?: number
        source?: string
        sourceTaskId?: string
        sourceRunId?: string
        sourceError?: string
      }
    ]
    result: GlobalMemoryData
  }
  'update-global-memory-fact': {
    payload: [
      factId: string,
      updates: Partial<
        Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>
      >
    ]
    result: GlobalMemoryData | undefined
  }
  'delete-global-memory-fact': { payload: [factId: string]; result: GlobalMemoryData | undefined }

  'agent:get-topic-hosts': { payload: [topicId: string]; result: Host[] }
  'agent:add-host': { payload: [topicId: string, hostId: string]; result: boolean }
  'agent:remove-host': { payload: [topicId: string, hostId: string]; result: boolean }

  'ssh:connect': { payload: [hostId: string, topicId?: string]; result: string }
  'ssh:get-buffer': { payload: [sessionId: string]; result: string }
  'ssh:agent:create': { payload: [hostId: string, topicId?: string]; result: string }
  'ssh:agent:execute': {
    payload: [
      sessionId: string,
      command: string,
      topicId?: string,
      taskId?: string,
      stepId?: string
    ]
    result: SSHAgentExecuteResult
  }
  'ssh:agent:close': { payload: [sessionId: string]; result: void }
  'ssh:agent:set-paused': { payload: [sessionId: string, paused: boolean]; result: boolean }
  'ssh:agent:is-paused': { payload: [sessionId: string]; result: boolean }

  'local:connect': { payload: [topicId: string]; result: TerminalSession }
  'local:get-buffer': { payload: [sessionId: string]; result: string }
  'local:close': { payload: [sessionId: string]; result: boolean }

  'agent:message': { payload: [topicId: string, content: string]; result: Message }
  'agent:get-sessions': { payload: [topicId: string]; result: TerminalSession[] }
  'agent:get-run': { payload: [runId: string]; result: AgentRun | undefined }
  'agent:get-runs-by-task': { payload: [taskId: string]; result: AgentRun[] }
  'agent:get-run-parts': { payload: [runId: string]; result: AgentPart[] }
  'agent:get-task-parts': { payload: [taskId: string]; result: AgentPart[] }
  'agent:cancel-run': { payload: [runId: string]; result: AgentRun | undefined }
  'agent:resume-run': { payload: [runId: string]; result: Message }
  'agent:auth-response': {
    payload: [requestId: string, approved: boolean, alwaysAllow?: boolean]
    result: void
  }

  'agent:create-terminal': {
    payload: [topicId: string, hostId: string, name?: string]
    result: TerminalSession
  }
  'agent:close-terminal': { payload: [id: string]; result: void }
  'agent:rename-terminal': { payload: [id: string, name: string]; result: void }
  'agent:toggle-terminal-pin': { payload: [id: string, isPinned: boolean]; result: void }
  'agent:set-session-paused': { payload: [id: string, paused: boolean]; result: boolean }
  'agent:is-session-paused': { payload: [id: string]; result: boolean }

  'get-model-settings': { payload: void; result: ModelSettings }
  'save-model-settings': { payload: [settings: Partial<ModelSettings>]; result: void }

  'get-providers': { payload: void; result: Provider[] }
  'get-provider': { payload: [id: string]; result: Provider | undefined }
  'save-provider': { payload: [provider: Provider]; result: void }
  'delete-provider': { payload: [id: string]; result: void }
  'test-provider-connection': {
    payload: [provider: Provider, modelId?: string]
    result: ProviderConnectionTestResult
  }
  'fetch-provider-models': { payload: [provider: Provider]; result: Model[] }

  'get-models': { payload: [providerId?: string]; result: Model[] }
  'save-model': { payload: [model: Model]; result: void }
  'delete-model': { payload: [id: string]; result: void }

  'get-permissions': { payload: void; result: PermissionSettings }
  'save-permissions': { payload: [permissions: Partial<PermissionSettings>]; result: void }

  'sftp:connect': { payload: [hostId: string]; result: SFTPConnectResult }
  'sftp:list': { payload: [sessionId: string, path: string]; result: SFTPFileEntry[] }
  'sftp:upload': {
    payload: [sessionId: string, localPath: string, remotePath: string]
    result: void
  }
  'sftp:download': {
    payload: [sessionId: string, remotePath: string, localPath: string]
    result: void
  }
  'sftp:mkdir': { payload: [sessionId: string, path: string]; result: void }
  'sftp:delete': { payload: [sessionId: string, path: string]; result: void }
  'sftp:close': { payload: [sessionId: string]; result: boolean }

  'search-commands': { payload: [query: string, limit?: number]; result: CommandSearchResult[] }

  'pf:create': {
    payload: [hostId: string, localPort: number, remoteHost: string, remotePort: number]
    result: PortForwardTunnel
  }
  'pf:close': { payload: [tunnelId: string]; result: boolean }
  'pf:list': { payload: [hostId?: string]; result: PortForwardTunnel[] }

  'session:get-recoverable': { payload: void; result: RecoverableSession[] }
}

export interface IpcSendChannels {
  'ssh:input': { payload: [id: string, data: string, topicId?: string] }
  'ssh:resize': { payload: [id: string, cols: number, rows: number] }
  'ssh:attach': { payload: [id: string] }
  'local:input': { payload: [id: string, data: string] }
  'local:resize': { payload: [id: string, cols: number, rows: number] }
  'local:attach': { payload: [id: string] }
}

type SshDataChannel = `ssh:data:${string}`
type SshClosedChannel = `ssh:closed:${string}`
type SshReadyChannel = `ssh:ready:${string}`
type SshCommandChannel = `ssh:command:${string}`
type TerminalCommandStartChannel = `terminal:command-start:${string}`
type TerminalCommandEndChannel = `terminal:command-end:${string}`
type TerminalControlStateChannel = `terminal:control-state:${string}`

type IpcPushChannelsDynamic = {
  [K in SshDataChannel]: { payload: string }
} & {
  [K in SshClosedChannel]: { payload: void }
} & {
  [K in SshReadyChannel]: { payload: string }
} & {
  [K in SshCommandChannel]: { payload: string }
} & {
  [K in TerminalCommandStartChannel]: { payload: TerminalCommandStartPayload }
} & {
  [K in TerminalCommandEndChannel]: { payload: TerminalCommandEndPayload }
} & {
  [K in TerminalControlStateChannel]: { payload: TerminalControlStatePayload }
}

interface IpcPushChannelsStatic {
  'agent:auth-request': { payload: AgentAuthRequestPayload }
  'agent:thinking': { payload: AgentThinkingPayload }
  'agent:run-created': { payload: AgentRun }
  'agent:run-updated': { payload: AgentRun }
  'agent:part-created': { payload: AgentPart }
  'agent:part-updated': { payload: AgentPart }
  'agent:step': { payload: Message }
  'agent:message': { payload: Message }
  'agent:tool-call': {
    payload: { topicId: string; taskId: string; toolName: string; args: Record<string, unknown> }
  }
  'agent:tool-result': {
    payload: { topicId: string; taskId: string; toolName: string; output: string; error?: boolean }
  }
  'agent:doom-loop': {
    payload: { topicId: string; taskId: string; toolName: string; callCount: number }
  }
  'agent:task-complete': {
    payload: { topicId: string; taskId: string; status: 'completed' | 'failed'; summary: string }
  }
  'agent:terminal-show': { payload: TerminalSession }
  'agent:terminal-hide': { payload: { id: string } }
  'agent:session-created': { payload: TerminalSession }
  'agent:session-closed': { payload: { id: string } }
  'topic:updated': { payload: TopicUpdatedPayload }
  'host:updated': { payload: HostUpdatedPayload }
  'debug:log': { payload: DebugLogEntry }
  'session:recovered': { payload: SessionRecoveredPayload }
}

export type IpcPushChannels = IpcPushChannelsDynamic & IpcPushChannelsStatic

export type InvokeChannel = keyof IpcInvokeChannels
export type SendChannel = keyof IpcSendChannels
export type PushChannel = keyof IpcPushChannels

export type InvokePayload<C extends InvokeChannel> = IpcInvokeChannels[C]['payload']
export type InvokeResult<C extends InvokeChannel> = IpcInvokeChannels[C]['result']
export type SendPayload<C extends SendChannel> = IpcSendChannels[C]['payload']
export type PushPayload<C extends PushChannel> = IpcPushChannels[C]['payload']
