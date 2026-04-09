/// <reference types="vite/client" />

interface Window {
  api: {
    getHosts: () => Promise<any[]>
    saveHost: (host: any) => Promise<void>
    deleteHost: (id: string) => Promise<void>
    createHost: (hostData: any) => Promise<any>
    connectSSH: (hostId: string, topicId?: string) => Promise<string>
    attachSSH: (sessionId: string) => Promise<void>
    getSSHBuffer: (sessionId: string) => Promise<string>
    onSSHData: (sessionId: string, callback: (data: string) => void) => () => void
    onSSHExit: (sessionId: string, callback: (code: number) => void) => () => void
    onSSHClosed: (sessionId: string, callback: () => void) => () => void
    sendSSHData: (sessionId: string, data: string) => Promise<void>
    sendSSHInput: (sessionId: string, data: string, topicId: string) => Promise<void>
    resizeSSH: (sessionId: string, cols: number, rows: number) => Promise<void>
    
    getTopics: () => Promise<any[]>
    createTopic: (title: string, hostIds: string[]) => Promise<any>
    deleteTopic: (id: string) => Promise<void>
    updateTopicHosts: (topicId: string, hostIds: string[]) => Promise<void>
    updateTopicTitle: (topicId: string, title: string) => Promise<void>
    sendMessage: (topicId: string, content: string) => Promise<any>
    getMessages: (topicId: string) => Promise<any[]>
    
    onAgentStep: (callback: (step: any) => void) => () => void
    onAgentTerminalShow: (callback: (data: any) => void) => () => void
    onAgentTerminalHide: (callback: (data: any) => void) => () => void
    onAgentTerminalData: (callback: (data: any) => void) => () => void
    onAgentTerminalStatus: (callback: (data: any) => void) => () => void
    onAgentAuthRequest: (callback: (requestId: string, command: string, riskLevel: string, reason: string) => void) => () => void
    resolveAgentAuth: (requestId: string, approved: boolean) => Promise<void>
    sendAgentAuthResponse: (requestId: string, approved: boolean) => Promise<void>
    sendTerminalData: (sessionId: string, data: string) => Promise<void>
    resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
    onTerminalData: (sessionId: string, callback: (data: string) => void) => () => void
    onTerminalExit: (sessionId: string, callback: (code: number) => void) => () => void
    
    onDebugLog: (callback: (entry: any) => void) => () => void
    toggleAgentTerminalPaused: (sessionId: string, paused: boolean) => Promise<void>
    setAgentSessionPaused: (sessionId: string, paused: boolean) => Promise<void>
    closeAgentTerminal: (sessionId: string) => Promise<void>
    onTopicUpdated: (callback: (data: { topicId: string, title: string }) => void) => () => void
    onAgentTerminalCreate: (callback: (data: any) => void) => () => void
    onAgentTerminalClose: (callback: (data: any) => void) => () => void
    onAgentSessionCreated: (callback: (data: any) => void) => () => void
    onTerminalCommandStart: (sessionId: string, callback: (data: any) => void) => () => void
    onTerminalCommandEnd: (sessionId: string, callback: (data: any) => void) => () => void
    createAgentTerminal: (topicId: string, hostId: string) => Promise<any>
    renameAgentTerminal: (sessionId: string, name: string) => Promise<void>
    toggleAgentTerminalPin: (sessionId: string, isPinned: boolean) => Promise<void>
    toggleTerminalPin: (sessionId: string, isPinned: boolean) => Promise<void>
    completeAgentCommand: (topicId: string | undefined, hostId: string | undefined, partial: string) => Promise<string | null>
    
    getProviders: () => Promise<any[]>
    saveProvider: (provider: any) => Promise<void>
    deleteProvider: (id: string) => Promise<void>
    getModels: () => Promise<any[]>
    saveModel: (model: any) => Promise<void>
    deleteModel: (id: string) => Promise<void>
    getPermissions: () => Promise<any[]>
    savePermissions: (permissions: any) => Promise<void>
    
    addHostToTopic: (topicId: string, hostId: string) => Promise<void>
    removeHostFromTopic: (topicId: string, hostId: string) => Promise<void>
    onAgentThinking: (callback: (data: { topicId: string; thinking: boolean }) => void) => () => void
  }
}
