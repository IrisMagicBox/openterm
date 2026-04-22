import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import type { AgentRun } from '../../shared/types'
import type { AgentContext } from '../AgentRunner'
import type { ToolRegistry } from '../tools'
import type { AgentConfig } from './agent-config'
import type { AgentPermissionEngine } from './agent-permission-engine'
import type { ProviderAdapter, TokenUsage } from './provider-adapter'

export interface AgentProcessorOptions {
  run: AgentRun
  context: AgentContext
  config: AgentConfig
  toolRegistry: ToolRegistry
  provider: ProviderAdapter
  permissionEngine: AgentPermissionEngine
  persistFinalMessage: boolean
  updateTaskStatus: boolean
}

export interface StreamResult {
  content: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
  usage: TokenUsage
  finishReason: string | null
  assistantPartId?: string
}

export type ToolChoice = 'auto' | 'none'

export interface ToolSelection {
  tools: ChatCompletionTool[]
  toolChoice: ToolChoice
}
