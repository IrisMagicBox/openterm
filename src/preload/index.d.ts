import { ElectronAPI } from '@electron-toolkit/preload'
import {
  Host,
  Topic,
  Message,
  ModelSettings,
  Provider,
  Model,
  PermissionSettings,
  Task,
  TaskStep,
  AgentRun,
  AgentPart,
  Approval,
  Artifact,
  TerminalSession,
  MemoryEntry,
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory
} from '../shared/types'
import type {
  DebugLogEntry,
  SessionRecoveredPayload,
  RecoverableSession,
  TerminalControlStatePayload
} from '../shared/ipc/channels'
import type {
  TerminalCommandCompletionRequest,
  TerminalCommandCompletionResult,
  TerminalCommandCompletionUiEvent,
  TerminalCommandDraftRequest,
  TerminalCommandDraftResult
} from '../shared/terminal-command-assist'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      hosts: {
        list: () => Promise<Host[]>
        create: (host: Omit<Host, 'id' | 'createdAt'>) => Promise<Host>
        delete: (id: string) => Promise<void>
        getTopicHosts: (topicId: string) => Promise<Host[]>
        addToTopic: (topicId: string, hostId: string) => Promise<boolean>
        removeFromTopic: (topicId: string, hostId: string) => Promise<boolean>
      }
      agent: {
        sendMessage: (topicId: string, content: string) => Promise<Message>
        getSessions: (topicId: string) => Promise<TerminalSession[]>
        getRun: (runId: string) => Promise<AgentRun | undefined>
        getRunsByTask: (taskId: string) => Promise<AgentRun[]>
        getRunParts: (runId: string) => Promise<AgentPart[]>
        getTaskParts: (taskId: string) => Promise<AgentPart[]>
        cancelRun: (runId: string) => Promise<AgentRun | undefined>
        resumeRun: (runId: string) => Promise<Message>
        sendAuthResponse: (
          requestId: string,
          approved: boolean,
          alwaysAllow?: boolean
        ) => Promise<void>
        onRunCreated: (callback: (run: AgentRun) => void) => () => void
        onRunUpdated: (callback: (run: AgentRun) => void) => () => void
        onPartCreated: (callback: (part: AgentPart) => void) => () => void
        onPartUpdated: (callback: (part: AgentPart) => void) => () => void
        onStep: (callback: (step: Message) => void) => () => void
        onThinking: (callback: (data: { topicId: string; thinking: boolean }) => void) => () => void
        onAuthRequest: (
          callback: (
            requestId: string,
            command: string,
            riskLevel?: string,
            reason?: string,
            metadata?: Record<string, unknown>
          ) => void
        ) => () => void
        onTaskComplete: (
          callback: (data: {
            topicId: string
            taskId: string
            status: 'completed' | 'failed'
            summary: string
          }) => void
        ) => () => void
      }
      terminal: {
        connectSSH: (hostId: string, topicId?: string) => Promise<string>
        sendSSHInput: (id: string, data: string, topicId?: string) => void
        resizeSSH: (id: string, cols: number, rows: number) => void
        getSSHBuffer: (id: string) => Promise<string>
        attachSSH: (id: string) => void
        connectLocal: (topicId: string) => Promise<TerminalSession>
        sendLocalInput: (id: string, data: string) => void
        resizeLocal: (id: string, cols: number, rows: number) => void
        getLocalBuffer: (id: string) => Promise<string>
        attachLocal: (id: string) => void
        closeLocal: (id: string) => Promise<boolean>
        createAgentTerminal: (
          topicId: string,
          hostId: string,
          name?: string
        ) => Promise<TerminalSession>
        closeAgentTerminal: (id: string, deletedBy?: 'user' | 'agent' | 'system') => Promise<void>
        renameAgentTerminal: (id: string, name: string) => Promise<void>
        toggleTerminalPin: (id: string, isPinned: boolean) => Promise<void>
        onCommandStart: (
          id: string,
          callback: (data: { inputId: string; command: string; source: string }) => void
        ) => () => void
        onCommandEnd: (
          id: string,
          callback: (data: {
            inputId: string
            outputId: string
            exitCode: number
            durationMs: number
            isTruncated: boolean
          }) => void
        ) => () => void
        onSSHData: (id: string, callback: (data: string) => void) => () => void
        onSSHClosed: (id: string, callback: () => void) => () => void
        draftCommand: (request: TerminalCommandDraftRequest) => Promise<TerminalCommandDraftResult>
        completeCommand: (
          request: TerminalCommandCompletionRequest
        ) => Promise<TerminalCommandCompletionResult>
        logCompletionUiEvent: (event: TerminalCommandCompletionUiEvent) => void
      }
      settings: {
        getModelSettings: () => Promise<ModelSettings>
        saveModelSettings: (settings: Partial<ModelSettings>) => Promise<void>
        getProviders: () => Promise<Provider[]>
        getProvider: (id: string) => Promise<Provider | undefined>
        saveProvider: (provider: Provider) => Promise<void>
        deleteProvider: (id: string) => Promise<void>
        testProviderConnection: (
          provider: Provider,
          modelId?: string
        ) => Promise<{ ok: boolean; message: string }>
        fetchProviderModels: (provider: Provider) => Promise<Model[]>
        getModels: (providerId?: string) => Promise<Model[]>
        saveModel: (model: Model) => Promise<void>
        deleteModel: (id: string) => Promise<void>
        getPermissions: () => Promise<PermissionSettings>
        savePermissions: (permissions: Pick<PermissionSettings, 'permissionMode'>) => Promise<void>
      }
      files: {
        sftpConnect: (hostId: string) => Promise<{ sessionId: string; hostId: string }>
        sftpList: Window['api']['sftpList']
        sftpUpload: Window['api']['sftpUpload']
        sftpDownload: Window['api']['sftpDownload']
        sftpMkdir: Window['api']['sftpMkdir']
        sftpDelete: Window['api']['sftpDelete']
        sftpClose: Window['api']['sftpClose']
        localFsConnect: Window['api']['localFsConnect']
        localFsList: Window['api']['localFsList']
        localFsUpload: Window['api']['localFsUpload']
        localFsDownload: Window['api']['localFsDownload']
        localFsMkdir: Window['api']['localFsMkdir']
        localFsDelete: Window['api']['localFsDelete']
        localFsClose: Window['api']['localFsClose']
        startNativeDrag: Window['api']['startNativeDrag']
        transferBetweenHosts: Window['api']['sftpTransferBetweenHosts']
        onTransferProgress: Window['api']['onSftpTransferProgress']
      }
      memories: {
        list: (filters?: {
          hostId?: string
          topicId?: string
          includeDisabled?: boolean
        }) => Promise<MemoryEntry[]>
        create: (
          memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> &
            Partial<Pick<MemoryEntry, 'scope'>>
        ) => Promise<MemoryEntry>
        update: (
          id: string,
          updates: Partial<
            Pick<
              MemoryEntry,
              'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
            >
          >
        ) => Promise<MemoryEntry | undefined>
        delete: (id: string) => Promise<void>
        getGlobal: () => Promise<GlobalMemoryData>
        importGlobal: (memory: GlobalMemoryData) => Promise<GlobalMemoryData>
        clearGlobal: () => Promise<GlobalMemoryData>
        createGlobalFact: (fact: {
          content: string
          category?: GlobalMemoryFactCategory | string
          confidence?: number
          source?: string
          sourceTaskId?: string
          sourceRunId?: string
          sourceError?: string
        }) => Promise<GlobalMemoryData>
        updateGlobalFact: (
          factId: string,
          updates: Partial<
            Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>
          >
        ) => Promise<GlobalMemoryData | undefined>
        deleteGlobalFact: (factId: string) => Promise<GlobalMemoryData | undefined>
      }
      getHosts: () => Promise<Host[]>
      createHost: (host: Omit<Host, 'id' | 'createdAt'>) => Promise<Host>
      deleteHost: (id: string) => Promise<void>
      getTopics: () => Promise<Topic[]>
      createTopic: (title: string, hostIds: string[]) => Promise<Topic>
      updateTopicTitle: (id: string, title: string) => Promise<void>
      deleteTopic: (id: string) => Promise<void>
      updateTopicHosts: (id: string, hostIds: string[]) => Promise<void>
      updateTopicModel: (id: string, providerId: string, modelId: string) => Promise<void>
      getMessages: (topicId: string) => Promise<Message[]>
      getTasks: (topicId?: string) => Promise<Task[]>
      getLatestTask: (topicId: string) => Promise<Task | undefined>
      getTaskSteps: (taskId: string) => Promise<TaskStep[]>
      getApprovals: (taskId: string) => Promise<Approval[]>
      getArtifacts: (taskId: string) => Promise<Artifact[]>
      getMemories: (filters?: {
        hostId?: string
        topicId?: string
        includeDisabled?: boolean
      }) => Promise<MemoryEntry[]>
      createMemory: (
        memory: Omit<MemoryEntry, 'id' | 'timestamp' | 'scope'> &
          Partial<Pick<MemoryEntry, 'scope'>>
      ) => Promise<MemoryEntry>
      updateMemory: (
        id: string,
        updates: Partial<
          Pick<
            MemoryEntry,
            'type' | 'scope' | 'content' | 'importance' | 'confidence' | 'disabled' | 'lastUsedAt'
          >
        >
      ) => Promise<MemoryEntry | undefined>
      deleteMemory: (id: string) => Promise<void>
      getGlobalMemory: () => Promise<GlobalMemoryData>
      importGlobalMemory: (memory: GlobalMemoryData) => Promise<GlobalMemoryData>
      clearGlobalMemory: () => Promise<GlobalMemoryData>
      createGlobalMemoryFact: (fact: {
        content: string
        category?: GlobalMemoryFactCategory | string
        confidence?: number
        source?: string
        sourceTaskId?: string
        sourceRunId?: string
        sourceError?: string
      }) => Promise<GlobalMemoryData>
      updateGlobalMemoryFact: (
        factId: string,
        updates: Partial<
          Pick<GlobalMemoryFact, 'content' | 'category' | 'confidence' | 'sourceError'>
        >
      ) => Promise<GlobalMemoryData | undefined>
      deleteGlobalMemoryFact: (factId: string) => Promise<GlobalMemoryData | undefined>

      // Host Pool Management
      getTopicHosts: (topicId: string) => Promise<Host[]>
      addHostToTopic: (topicId: string, hostId: string) => Promise<Topic | undefined>
      removeHostFromTopic: (topicId: string, hostId: string) => Promise<Topic | undefined>

      connectSSH: (hostId: string, topicId?: string) => Promise<string>
      sendSSHInput: (id: string, data: string, topicId?: string) => void
      resizeSSH: (id: string, cols: number, rows: number) => void
      onSSHData: (id: string, callback: (data: string) => void) => () => void
      onSSHClosed: (id: string, callback: () => void) => () => void
      getSSHBuffer: (id: string) => Promise<string>
      attachSSH: (id: string) => void

      sendMessage: (topicId: string, content: string) => Promise<Message>
      getAgentSessions: (topicId: string) => Promise<TerminalSession[]>
      getAgentRun: (runId: string) => Promise<AgentRun | undefined>
      getAgentRunsByTask: (taskId: string) => Promise<AgentRun[]>
      getAgentRunParts: (runId: string) => Promise<AgentPart[]>
      getAgentTaskParts: (taskId: string) => Promise<AgentPart[]>
      cancelAgentRun: (runId: string) => Promise<AgentRun | undefined>
      resumeAgentRun: (runId: string) => Promise<Message>

      onAgentAuthRequest: (
        callback: (
          requestId: string,
          command: string,
          riskLevel?: string,
          reason?: string,
          metadata?: Record<string, unknown>
        ) => void
      ) => () => void
      sendAgentAuthResponse: (
        requestId: string,
        approved: boolean,
        alwaysAllow?: boolean
      ) => Promise<void>
      onTopicUpdated: (
        callback: (data: {
          topicId: string
          title?: string
          topic?: Topic
          deleted?: boolean
        }) => void
      ) => () => void
      onAgentStep: (callback: (step: Message) => void) => () => void
      onAgentRunCreated: (callback: (run: AgentRun) => void) => () => void
      onAgentRunUpdated: (callback: (run: AgentRun) => void) => () => void
      onAgentPartCreated: (callback: (part: AgentPart) => void) => () => void
      onAgentPartUpdated: (callback: (part: AgentPart) => void) => () => void
      onZoomShortcut: (
        callback: (data: { direction: 'in' | 'out' | 'reset' }) => void
      ) => () => void
      onAgentThinking: (
        callback: (data: { topicId: string; thinking: boolean }) => void
      ) => () => void

      onAgentSessionCreated: (callback: (data: TerminalSession) => void) => () => void
      onAgentSessionClosed: (callback: (data: { id: string }) => void) => () => void

      onTerminalCommandStart: (
        id: string,
        callback: (data: { inputId: string; command: string; source: string }) => void
      ) => () => void
      onTerminalCommandEnd: (
        id: string,
        callback: (data: {
          inputId: string
          outputId: string
          exitCode: number
          durationMs: number
          isTruncated: boolean
        }) => void
      ) => () => void

      createAgentSSHSession: (hostId: string, topicId?: string) => Promise<string>
      executeAgentSSHCommand: (
        id: string,
        command: string,
        topicId?: string,
        taskId?: string,
        stepId?: string
      ) => Promise<{ content: string; exitCode: number; durationMs: number }>
      closeAgentSSHSession: (id: string) => Promise<void>
      setAgentSessionPaused: (id: string, paused: boolean) => Promise<boolean>
      isAgentSessionPaused: (id: string) => Promise<boolean>
      onSSHReady: (id: string, callback: (hostAlias: string) => void) => () => void
      onSSHCommand: (id: string, callback: (command: string) => void) => () => void

      // Local Terminal Agent State
      onTerminalAgentExecuting: (id: string, callback: (executing: boolean) => void) => () => void
      onTerminalUserTakeover: (id: string, callback: () => void) => () => void
      onTerminalControlState: (
        id: string,
        callback: (state: TerminalControlStatePayload) => void
      ) => () => void

      // Multi-Terminal Management
      createAgentTerminal: (
        topicId: string,
        hostId: string,
        name?: string
      ) => Promise<TerminalSession>
      closeAgentTerminal: (id: string, deletedBy?: 'user' | 'agent' | 'system') => Promise<void>
      renameAgentTerminal: (id: string, name: string) => Promise<void>
      toggleTerminalPin: (id: string, isPinned: boolean) => Promise<void>

      getModelSettings: () => Promise<ModelSettings>
      saveModelSettings: (settings: Partial<ModelSettings>) => Promise<void>

      getProviders: () => Promise<Provider[]>
      getProvider: (id: string) => Promise<Provider | undefined>
      saveProvider: (provider: Provider) => Promise<void>
      deleteProvider: (id: string) => Promise<void>
      testProviderConnection: (
        provider: Provider,
        modelId?: string
      ) => Promise<{ ok: boolean; message: string }>
      fetchProviderModels: (provider: Provider) => Promise<Model[]>

      getModels: (providerId?: string) => Promise<Model[]>
      saveModel: (model: Model) => Promise<void>
      deleteModel: (id: string) => Promise<void>

      // Permission Settings APIs
      getPermissions: () => Promise<PermissionSettings>
      savePermissions: (permissions: Pick<PermissionSettings, 'permissionMode'>) => Promise<void>
      onDebugLog: (callback: (entry: DebugLogEntry) => void) => () => void

      // Local Terminal APIs
      connectLocal: (topicId: string) => Promise<TerminalSession>
      sendLocalInput: (id: string, data: string) => void
      resizeLocal: (id: string, cols: number, rows: number) => void
      getLocalBuffer: (id: string) => Promise<string>
      attachLocal: (id: string) => void
      closeLocal: (id: string) => Promise<boolean>

      // SFTP File Transfer APIs
      sftpConnect: (hostId: string) => Promise<{ sessionId: string; hostId: string }>
      sftpList: (
        sessionId: string,
        path: string
      ) => Promise<
        {
          name: string
          type: 'directory' | 'file'
          size: number
          modifyTime: number
          permissions: number
        }[]
      >
      sftpUpload: (sessionId: string, localPath: string, remotePath: string) => Promise<void>
      sftpDownload: (sessionId: string, remotePath: string, localPath: string) => Promise<void>
      sftpMkdir: (sessionId: string, path: string) => Promise<void>
      sftpDelete: (sessionId: string, path: string) => Promise<void>
      sftpClose: (sessionId: string) => Promise<boolean>

      // Local Filesystem APIs
      localFsConnect: () => Promise<{ sessionId: string; hostId: string; homeDir: string }>
      localFsList: (
        sessionId: string,
        path: string
      ) => Promise<
        {
          name: string
          type: 'directory' | 'file'
          size: number
          modifyTime: number
          permissions: number
        }[]
      >
      localFsUpload: (sessionId: string, localPath: string, remotePath: string) => Promise<void>
      localFsDownload: (sessionId: string, remotePath: string, localPath: string) => Promise<void>
      localFsMkdir: (sessionId: string, path: string) => Promise<void>
      localFsDelete: (sessionId: string, path: string) => Promise<void>
      localFsClose: (sessionId: string) => Promise<void>
      startNativeDrag: (filePath: string, iconPath?: string) => void

      sftpTransferBetweenHosts: (
        transferId: string,
        sourceHostId: string,
        sourcePath: string,
        destHostId: string,
        destPath: string
      ) => Promise<{ success: boolean; transferId: string }>
      onSftpTransferProgress: (
        transferId: string,
        callback: (data: { phase: string; progress: number; transferId: string }) => void
      ) => () => void

      // Command History Search
      searchCommands: (
        query: string,
        limit?: number
      ) => Promise<{ content: string; source: string; hostId: string; timestamp: number }[]>
      draftTerminalCommand: (
        request: TerminalCommandDraftRequest
      ) => Promise<TerminalCommandDraftResult>
      completeTerminalCommand: (
        request: TerminalCommandCompletionRequest
      ) => Promise<TerminalCommandCompletionResult>
      logTerminalCompletionUiEvent: (event: TerminalCommandCompletionUiEvent) => void

      // Port Forwarding APIs
      pfCreate: (
        hostId: string,
        localPort: number,
        remoteHost: string,
        remotePort: number
      ) => Promise<{
        id: string
        hostId: string
        localPort: number
        remoteHost: string
        remotePort: number
        status: string
        createdAt: number
      }>
      pfClose: (tunnelId: string) => Promise<boolean>
      pfList: (hostId?: string) => Promise<
        {
          id: string
          hostId: string
          localPort: number
          remoteHost: string
          remotePort: number
          status: string
          createdAt: number
        }[]
      >

      // Session Recovery
      getRecoverableSessions: () => Promise<RecoverableSession[]>
      onSessionRecovered: (callback: (data: SessionRecoveredPayload) => void) => () => void
    }
  }
}
