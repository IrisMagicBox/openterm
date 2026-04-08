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
  Artifact
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

      connectSSH: (hostId: string) => Promise<string>
      sendSSHInput: (sessionId: string, data: string) => void
      resizeSSH: (sessionId: string, cols: number, rows: number) => void
      onSSHData: (sessionId: string, callback: (data: string) => void) => () => void
      onSSHClosed: (sessionId: string, callback: () => void) => () => void

      sendMessage: (topicId: string, content: string) => Promise<Message>
      getAgentSessions: (
        topicId: string
      ) => Promise<{ sessionId: string; hostId: string; hostAlias: string }[]>
      addHostToTopic: (topicId: string, hostId: string) => Promise<boolean>
      removeHostFromTopic: (topicId: string, hostId: string) => Promise<boolean>

      onAgentAuthRequest: (callback: (requestId: string, command: string) => void) => () => void
      sendAgentAuthResponse: (requestId: string, approved: boolean) => Promise<void>
      onTopicUpdated: (callback: (data: { topicId: string; title: string }) => void) => () => void
      onAgentStep: (callback: (step: Message) => void) => () => void

      onAgentTerminalShow: (
        callback: (data: {
          sessionId: string
          hostId: string
          hostAlias: string
          command: string
        }) => void
      ) => () => void
      onAgentTerminalHide: (callback: (data: { sessionId: string }) => void) => () => void
      onAgentSessionCreated: (
        callback: (data: {
          topicId: string
          hostId: string
          hostAlias: string
          sessionId: string
        }) => void
      ) => () => void

      createAgentSSHSession: (hostId: string) => Promise<string>
      executeAgentSSHCommand: (sessionId: string, command: string) => Promise<string>
      closeAgentSSHSession: (sessionId: string) => Promise<void>
      onSSHReady: (sessionId: string, callback: (hostAlias: string) => void) => () => void
      onSSHCommand: (sessionId: string, callback: (command: string) => void) => () => void

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
    }
  }
}
