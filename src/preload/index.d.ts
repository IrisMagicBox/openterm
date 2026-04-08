import { ElectronAPI } from '@electron-toolkit/preload'
import { Host, Topic, Message, ModelSettings, Provider, Model } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getHosts: () => Promise<Host[]>
      createHost: (host: Omit<Host, 'id' | 'createdAt'>) => Promise<Host>
      deleteHost: (id: string) => Promise<void>
      getTopics: () => Promise<Topic[]>
      createTopic: (title: string, hostIds: string[]) => Promise<Topic>
      updateTopicHosts: (topicId: string, hostIds: string[]) => Promise<void>
      getMessages: (topicId: string) => Promise<Message[]>

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

      getModels: (providerId?: string) => Promise<Model[]>
      saveModel: (model: Model) => Promise<void>
      deleteModel: (id: string) => Promise<void>
    }
  }
}
