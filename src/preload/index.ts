import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ApprovalStatus } from '../shared/types'

// Custom APIs for renderer
const api = {
  getHosts: () => ipcRenderer.invoke('get-hosts'),
  createHost: (host: any) => ipcRenderer.invoke('create-host', host),
  deleteHost: (id: string) => ipcRenderer.invoke('delete-host', id),
  getTopics: () => ipcRenderer.invoke('get-topics'),
  createTopic: (title: string, hostIds: string[]) =>
    ipcRenderer.invoke('create-topic', title, hostIds),
  updateTopicTitle: (topicId: string, title: string) =>
    ipcRenderer.invoke('update-topic-title', topicId, title),
  deleteTopic: (topicId: string) => ipcRenderer.invoke('delete-topic', topicId),
  updateTopicHosts: (topicId: string, hostIds: string[]) =>
    ipcRenderer.invoke('update-topic-hosts', topicId, hostIds),
  getMessages: (topicId: string) => ipcRenderer.invoke('get-messages', topicId),
  getTasks: (topicId?: string) => ipcRenderer.invoke('get-tasks', topicId),
  getLatestTask: (topicId: string) => ipcRenderer.invoke('get-latest-task', topicId),
  createTask: (task: any) => ipcRenderer.invoke('create-task', task),
  updateTask: (id: string, updates: any) => ipcRenderer.invoke('update-task', id, updates),
  getTaskSteps: (taskId: string) => ipcRenderer.invoke('get-task-steps', taskId),
  createTaskStep: (step: any) => ipcRenderer.invoke('create-task-step', step),
  updateTaskStep: (id: string, updates: any) => ipcRenderer.invoke('update-task-step', id, updates),
  getApprovals: (taskId: string) => ipcRenderer.invoke('get-approvals', taskId),
  createApproval: (approval: any) => ipcRenderer.invoke('create-approval', approval),
  updateApprovalStatus: (id: string, status: ApprovalStatus) =>
    ipcRenderer.invoke('update-approval-status', id, status),
  getArtifacts: (taskId: string) => ipcRenderer.invoke('get-artifacts', taskId),
  createArtifact: (artifact: any) => ipcRenderer.invoke('create-artifact', artifact),

  // Host Pool Management
  getTopicHosts: (topicId: string) => ipcRenderer.invoke('agent:get-topic-hosts', topicId),
  addHostToTopic: (topicId: string, hostId: string) =>
    ipcRenderer.invoke('agent:add-host', topicId, hostId),
  removeHostFromTopic: (topicId: string, hostId: string) =>
    ipcRenderer.invoke('agent:remove-host', topicId, hostId),

  // SSH Terminal APIs
  connectSSH: (hostId: string) => ipcRenderer.invoke('ssh:connect', hostId),
  sendSSHInput: (id: string, data: string, topicId?: string) =>
    ipcRenderer.send('ssh:input', id, data, topicId),
  resizeSSH: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('ssh:resize', id, cols, rows),
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
  completeAgentCommand: (topicId: string, hostId: string, partialCommand: string) =>
    ipcRenderer.invoke('agent:complete-command', topicId, hostId, partialCommand),
  getAgentSessions: (topicId: string) => ipcRenderer.invoke('agent:get-sessions', topicId),

  // Agent Authorization (HITL)
  onAgentAuthRequest: (
    callback: (requestId: string, command: string, riskLevel?: string, reason?: string) => void
  ) => {
    const listener = (_event, requestId: string, command: string, riskLevel?: string, reason?: string) =>
      callback(requestId, command, riskLevel, reason)
    ipcRenderer.on('agent:auth-request', listener)
    return () => ipcRenderer.removeListener('agent:auth-request', listener)
  },
  sendAgentAuthResponse: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('agent:auth-response', requestId, approved),
  onTopicUpdated: (callback: (data: { topicId: string; title: string }) => void) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on('topic:updated', listener)
    return () => ipcRenderer.removeListener('topic:updated', listener)
  },
  onAgentThinking: (
    callback: (data: { topicId: string; thinking: boolean }) => void
  ) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on('agent:thinking', listener)
    return () => ipcRenderer.removeListener('agent:thinking', listener)
  },
  onAgentStep: (
    callback: (step: any) => void
  ) => {
    const listener = (_event, step: any) => callback(step)
    ipcRenderer.on('agent:step', listener)
    return () => ipcRenderer.removeListener('agent:step', listener)
  },

  onAgentTerminalShow: (
    callback: (data: any) => void
  ) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on('agent:terminal-show', listener)
    return () => ipcRenderer.removeListener('agent:terminal-show', listener)
  },
  onAgentTerminalHide: (callback: (data: { id: string }) => void) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on('agent:terminal-hide', listener)
    return () => ipcRenderer.removeListener('agent:terminal-hide', listener)
  },
  onAgentSessionCreated: (
    callback: (data: any) => void
  ) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on('agent:session-created', listener)
    return () => ipcRenderer.removeListener('agent:session-created', listener)
  },

  onTerminalCommandStart: (
    id: string,
    callback: (data: any) => void
  ) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on(`terminal:command-start:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:command-start:${id}`, listener)
  },

  onTerminalCommandEnd: (
    id: string,
    callback: (data: any) => void
  ) => {
    const listener = (_event, data: any) => callback(data)
    ipcRenderer.on(`terminal:command-end:${id}`, listener)
    return () => ipcRenderer.removeListener(`terminal:command-end:${id}`, listener)
  },

  createAgentSSHSession: (hostId: string, topicId?: string) =>
    ipcRenderer.invoke('ssh:agent:create', hostId, topicId),
  executeAgentSSHCommand: (id: string, command: string) =>
    ipcRenderer.invoke('ssh:agent:execute', id, command),
  closeAgentSSHSession: (id: string) => ipcRenderer.invoke('ssh:agent:close', id),
  setAgentSessionPaused: (id: string, paused: boolean) =>
    ipcRenderer.invoke('ssh:agent:set-paused', id, paused),
  isAgentSessionPaused: (id: string) => ipcRenderer.invoke('ssh:agent:is-paused', id),
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

  // Multi-Terminal Management
  createAgentTerminal: (topicId: string, hostId: string, name?: string) =>
    ipcRenderer.invoke('agent:create-terminal', topicId, hostId, name),
  closeAgentTerminal: (id: string) => ipcRenderer.invoke('agent:close-terminal', id),
  renameAgentTerminal: (id: string, name: string) =>
    ipcRenderer.invoke('agent:rename-terminal', id, name),
  toggleTerminalPin: (id: string, isPinned: boolean) =>
    ipcRenderer.invoke('agent:toggle-terminal-pin', id, isPinned),

  getModelSettings: () => ipcRenderer.invoke('get-model-settings'),
  saveModelSettings: (settings: any) =>
    ipcRenderer.invoke('save-model-settings', settings),

  getProviders: () => ipcRenderer.invoke('get-providers'),
  getProvider: (id: string) => ipcRenderer.invoke('get-provider', id),
  saveProvider: (provider: any) => ipcRenderer.invoke('save-provider', provider),
  deleteProvider: (id: string) => ipcRenderer.invoke('delete-provider', id),
  testProviderConnection: (provider: any, modelId?: string) =>
    ipcRenderer.invoke('test-provider-connection', provider, modelId),

  getModels: (providerId?: string) => ipcRenderer.invoke('get-models', providerId),
  saveModel: (model: any) => ipcRenderer.invoke('save-model', model),
  deleteModel: (id: string) => ipcRenderer.invoke('delete-model', id),

  // Permission Settings APIs
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  savePermissions: (permissions: any) => ipcRenderer.invoke('save-permissions', permissions),
  onDebugLog: (callback: (entry: any) => void) => {
    const listener = (_event, entry: any) => callback(entry)
    ipcRenderer.on('debug:log', listener)
    return () => ipcRenderer.removeListener('debug:log', listener)
  }
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
