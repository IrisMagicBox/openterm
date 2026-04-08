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
  | 'groq'
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
