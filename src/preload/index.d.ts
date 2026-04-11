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
  Approval,
  Artifact,
  TerminalSession
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getHosts: () => Promise<Host[]>
      createHost: (host: Omit<Host, 'id' | 'createdAt'>) => Promise<Host>
      deleteHost: (id: string) => Promise<void>
      getTopics: () => Promise<Topic[]>
      createTopic: (title: string, hostIds: string[]) => Promise<Topic>
      updateTopicTitle: (topicId: string, title: string) => Promise<void>
      deleteTopic: (topicId: string) => Promise<void>
      updateTopicHosts: (topicId: string, hostIds: string[]) => Promise<void>
      getMessages: (topicId: string) => Promise<Message[]>
      getTasks: (topicId?: string) => Promise<Task[]>
      getLatestTask: (topicId: string) => Promise<Task | undefined>
      createTask: (
        task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> &
          Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>>
      ) => Promise<Task>
      updateTask: (
        id: string,
        updates: Partial<Omit<Task, 'id' | 'topicId' | 'createdAt'>>
      ) => Promise<Task | undefined>
      getTaskSteps: (taskId: string) => Promise<TaskStep[]>
      createTaskStep: (
        step: Omit<TaskStep, 'id' | 'createdAt' | 'updatedAt'> &
          Partial<Pick<TaskStep, 'id' | 'createdAt' | 'updatedAt'>>
      ) => Promise<TaskStep>
      updateTaskStep: (
        id: string,
        updates: Partial<Omit<TaskStep, 'id' | 'taskId' | 'createdAt'>>
      ) => Promise<TaskStep | undefined>
      getApprovals: (taskId: string) => Promise<Approval[]>
      createApproval: (
        approval: Omit<Approval, 'id' | 'createdAt'> & Partial<Pick<Approval, 'id' | 'createdAt'>>
      ) => Promise<Approval>
      updateApprovalStatus: (
        id: string,
        status: Approval['status']
      ) => Promise<Approval | undefined>
      getArtifacts: (taskId: string) => Promise<Artifact[]>
      createArtifact: (
        artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'> &
          Partial<Pick<Artifact, 'id' | 'createdAt' | 'updatedAt'>>
      ) => Promise<Artifact>

      // Host Pool Management
      getTopicHosts: (topicId: string) => Promise<Host[]>
      addHostToTopic: (topicId: string, hostId: string) => Promise<boolean>
      removeHostFromTopic: (topicId: string, hostId: string) => Promise<boolean>

      connectSSH: (hostId: string) => Promise<string>
      sendSSHInput: (id: string, data: string, topicId?: string) => void
      resizeSSH: (id: string, cols: number, rows: number) => void
      onSSHData: (id: string, callback: (data: string) => void) => () => void
      onSSHClosed: (id: string, callback: () => void) => () => void
      getSSHBuffer: (id: string) => Promise<string>
      attachSSH: (id: string) => void

      sendMessage: (topicId: string, content: string) => Promise<Message>
      getAgentSessions: (topicId: string) => Promise<TerminalSession[]>

      onAgentAuthRequest: (
        callback: (requestId: string, command: string, riskLevel?: string, reason?: string) => void
      ) => () => void
      sendAgentAuthResponse: (
        requestId: string,
        approved: boolean,
        alwaysAllow?: boolean
      ) => Promise<void>
      onTopicUpdated: (callback: (data: { topicId: string; title: string }) => void) => () => void
      onAgentStep: (callback: (step: Message) => void) => () => void

      onAgentTerminalShow: (callback: (data: TerminalSession) => void) => () => void
      onAgentTerminalHide: (callback: (data: { id: string }) => void) => () => void
      onAgentSessionCreated: (callback: (data: TerminalSession) => void) => () => void

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

      // Multi-Terminal Management
      createAgentTerminal: (
        topicId: string,
        hostId: string,
        name?: string
      ) => Promise<TerminalSession>
      closeAgentTerminal: (id: string) => Promise<void>
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

      getModels: (providerId?: string) => Promise<Model[]>
      saveModel: (model: Model) => Promise<void>
      deleteModel: (id: string) => Promise<void>

      // Permission Settings APIs
      getPermissions: () => Promise<PermissionSettings>
      savePermissions: (permissions: Partial<PermissionSettings>) => Promise<void>
      onDebugLog: (callback: (entry: any) => void) => () => void

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

      // Command History Search
      searchCommands: (
        query: string,
        limit?: number
      ) => Promise<{ content: string; source: string; hostId: string; timestamp: number }[]>

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
    }
  }
}
