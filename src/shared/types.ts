export interface Host {
  id: string
  alias: string
  ip: string
  port: number
  username: string
  password?: string
  keyPath?: string
  tags: string[]
  createdAt: number
}

export interface Topic {
  id: string
  title: string
  hostIds: string[]
  lastMessageAt: number
  createdAt: number
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskStepType = 'plan' | 'command' | 'result' | 'approval' | 'final' | 'note'

export type TaskStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'

export type ApprovalRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type ArtifactType = 'report' | 'script' | 'diff' | 'log' | 'note'

export interface Task {
  id: string
  topicId: string
  title: string
  goal: string
  status: TaskStatus
  summary?: string
  selectedProviderId?: string
  selectedModelId?: string
  createdAt: number
  updatedAt: number
}

export interface TaskStep {
  id: string
  taskId: string
  type: TaskStepType
  status: TaskStepStatus
  hostId?: string
  title?: string
  content: string
  rawOutput?: string
  metadata?: Record<string, unknown>
  startedAt?: number
  endedAt?: number
  createdAt: number
  updatedAt: number
}

export interface Approval {
  id: string
  taskId: string
  stepId?: string
  command: string
  riskLevel: ApprovalRiskLevel
  reason?: string
  status: ApprovalStatus
  createdAt: number
  respondedAt?: number
}

export interface Artifact {
  id: string
  taskId: string
  type: ArtifactType
  title: string
  content: string
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  topicId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  thought?: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  toolCallId: string
  content: string
}

export interface ModelSettings {
  id: string
  apiKey: string
  baseURL: string
  model: string
  updatedAt: number
}

export interface PermissionSettings {
  requireConfirmation: boolean
  autoExecuteSafeOperations: boolean
  updatedAt: number
}

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'
  | 'ollama'
  | 'lmstudio'
  | 'openrouter'
  | 'deepseek'
  | 'silicon'
  | 'minimax'
  | 'groq'
  | 'mistral'
  | 'together'
  | 'fireworks'
  | 'nvidia'
  | 'grok'
  | 'hyperbolic'
  | 'jina'
  | 'perplexity'
  | 'modelscope'
  | 'hunyuan'
  | 'baidu-cloud'
  | 'aws-bedrock'
  | 'vertexai'
  | 'github'
  | 'copilot'
  | 'custom'

export type ModelCapability = 'text' | 'vision' | 'embedding' | 'reasoning' | 'image-generation'

export interface ModelPricing {
  input_per_million_tokens?: number
  output_per_million_tokens?: number
}

export interface Model {
  id: string
  providerId: string
  name: string
  group?: string
  capabilities?: ModelCapability[]
  endpointType?: string
  pricing?: ModelPricing
  createdAt: number
}

export interface ProviderApiOptions {
  isNotSupportArrayContent?: boolean
  isNotSupportStreamOptions?: boolean
  isSupportDeveloperRole?: boolean
  isSupportServiceTier?: boolean
  isNotSupportEnableThinking?: boolean
  isNotSupportAPIVersion?: boolean
  isNotSupportVerbosity?: boolean
}

export interface Provider {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  apiHost: string
  apiVersion?: string
  enabled: boolean
  isSystem?: boolean
  config?: {
    apiOptions?: ProviderApiOptions
    extra_headers?: Record<string, string>
  }
  createdAt: number
  updatedAt: number
}

export type SystemProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'
  | 'ollama'
  | 'lmstudio'
  | 'openrouter'
  | 'deepseek'
  | 'silicon'
  | 'minimax'
  | 'groq'
  | 'mistral'
  | 'together'
  | 'fireworks'
  | 'nvidia'
  | 'grok'
  | 'aws-bedrock'
  | 'vertexai'
  | 'github'
  | 'copilot'
  | 'coreshub'
