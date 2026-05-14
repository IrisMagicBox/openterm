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
  agentNotes?: string
}

export interface Topic {
  id: string
  title: string
  hostIds: string[]
  selectedProviderId?: string
  selectedModelId?: string
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

export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'retrying'
  | 'compacting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentRunStopReason =
  | 'completed'
  | 'max_turns'
  | 'context_overflow'
  | 'provider_error'
  | 'tool_error'
  | 'permission_rejected'
  | 'aborted'
  | 'blocked_empty_response'

export type AgentPartType =
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'permission'
  | 'compaction'
  | 'subagent'
  | 'usage'
  | 'error'
  | 'step'
  | 'step_start'
  | 'step_finish'
  | 'snapshot'
  | 'patch'

export type AgentPartStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'blocked'

export type ApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical'

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

export interface AgentRun {
  id: string
  topicId: string
  taskId: string
  parentRunId?: string
  parentPartId?: string
  agentName: string
  mode: 'primary' | 'subagent' | 'hidden'
  status: AgentRunStatus
  goal: string
  providerId?: string
  modelId?: string
  usage?: Record<string, unknown>
  metadata?: Record<string, unknown>
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface AgentPart {
  id: string
  runId: string
  messageId?: string
  parentPartId?: string
  type: AgentPartType
  status: AgentPartStatus
  role?: 'user' | 'assistant' | 'system' | 'tool'
  toolName?: string
  toolCallId?: string
  hostId?: string
  sessionId?: string
  input?: string
  output?: string
  error?: string
  metadata?: Record<string, unknown>
  orderIndex: number
  startedAt?: number
  endedAt?: number
  createdAt: number
  updatedAt: number
}

export type PolicyRiskCategory =
  | 'read'
  | 'write'
  | 'network'
  | 'package'
  | 'privilege'
  | 'destructive'

export interface Approval {
  id: string
  taskId: string
  stepId?: string
  command: string
  riskLevel: ApprovalRiskLevel
  riskCategory?: PolicyRiskCategory
  commandPattern?: string
  requiresVerification?: boolean
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
  runId?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  thought?: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
  metadata?: {
    isVerifying?: boolean
    isReflection?: boolean
    policyReason?: string
    riskLevel?: ApprovalRiskLevel
    memoryRecalled?: boolean
    agentStatus?: 'thinking' | 'executing' | 'verifying' | 'reflecting' | 'done' | 'error'
    taskId?: string
    steps?: TaskStep[]
  }
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
  metadata?: Record<string, unknown>
}

export type TerminalSessionStatus = 'active' | 'streaming' | 'closed' | 'disconnected'
export type TerminalSessionRole = 'agent_command' | 'interactive' | 'user'
export type TerminalTakeoverMode = 'auto' | 'manual'
export type TerminalSessionDeletedBy = 'user' | 'agent' | 'system'

export interface TerminalSession {
  id: string
  topicId: string
  hostId: string
  hostAlias: string
  role?: TerminalSessionRole
  name?: string
  status: TerminalSessionStatus
  shellType?: string
  shellIntegrationReady: boolean
  isLocked?: boolean
  lockedBy?: 'agent' | 'user' | null
  takeoverMode?: TerminalTakeoverMode | null
  isPinned?: boolean
  visible?: boolean
  paused?: boolean
  command?: string
  commandSource?: 'agent' | 'user'
  commandStatus?: 'idle' | 'running' | 'completed' | 'failed'
  commandExitCode?: number
  commandDurationMs?: number
  commandStartTime?: number
  createdAt: number
  closedAt?: number
  agentNotes?: string
  isDeleted?: boolean
  deletedAt?: number
  deletedBy?: string
}

export type TerminalIOType = 'input' | 'output'
export type TerminalIOSource = 'agent' | 'user' | 'system'

export interface TerminalIO {
  id: string
  sessionId: string
  topicId: string
  hostId: string
  type: TerminalIOType
  source: TerminalIOSource
  content: string
  exitCode?: number
  durationMs?: number
  relatedInputId?: string
  isStreaming?: boolean
  chunkIndex?: number
  isTruncated?: boolean
  cwd?: string
  taskId?: string
  stepId?: string
  timestamp: number
  isDeleted?: boolean
  deletedAt?: number
  deletedBy?: string
}

export interface CommandResult {
  content: string
  exitCode: number
  durationMs: number
  isTruncated: boolean
  sessionId: string
  timedOut?: boolean
  cwd?: string
}

export interface StructuredObservation {
  hostId: string
  terminalName: string
  exitCode: number
  cwd?: string
  durationMs: number
  stdout: string
  stderr: string
  isTruncated: boolean
  truncatedAt?: number
  diskPath?: string
}

export type TerminalCompletionBackendMode = 'prompt' | 'function'

export interface ModelSettings {
  id: string
  apiKey: string
  baseURL: string
  model: string
  terminalCompletionMode: TerminalCompletionBackendMode
  updatedAt: number
}

export type PermissionMode = 'default' | 'auto_review' | 'full_access'

export interface PermissionSettings {
  permissionMode: PermissionMode
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
  | 'dashscope'
  | 'moonshot'
  | 'zhipu'
  | 'doubao'
  | 'baichuan'
  | 'stepfun'
  | 'yi'
  | 'ppio'
  | 'aws-bedrock'
  | 'vertexai'
  | 'github'
  | 'copilot'
  | 'custom'

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'embedding'
  | 'reasoning'
  | 'image-generation'
  | 'tool-use'
  | 'rerank'

export interface ModelPricing {
  input_per_million_tokens?: number
  output_per_million_tokens?: number
}

export interface Model {
  id: string
  providerId: string
  providerModelId?: string
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
  | 'hyperbolic'
  | 'jina'
  | 'perplexity'
  | 'modelscope'
  | 'hunyuan'
  | 'baidu-cloud'
  | 'dashscope'
  | 'moonshot'
  | 'zhipu'
  | 'doubao'
  | 'baichuan'
  | 'stepfun'
  | 'yi'
  | 'ppio'
  | 'aws-bedrock'
  | 'vertexai'
  | 'github'
  | 'copilot'
  | 'coreshub'

export type TrustLevel = 'untrusted' | 'familiar' | 'trusted'

export interface CommandPattern {
  id: string
  hostId: string
  commandPattern: string
  approvalCount: number
  rejectionCount: number
  trustLevel: TrustLevel
  lastSeen: number
  createdAt: number
}

export interface TerminalStream {
  write(data: string | Buffer): boolean
  setWindow(rows: number, cols: number, width: number, height: number): boolean
  close(): void
  on(event: 'data', listener: (data: string | Buffer) => void): this
  on(event: 'close', listener: () => void): this
  on(event: string, listener: (...args: unknown[]) => void): this
  removeListener(event: string, listener: (...args: unknown[]) => void): this
}

export type MemoryType =
  | 'user_preference'
  | 'host_fact'
  | 'topic_summary'
  | 'task_experience'
  | 'policy_hint'

export type MemoryScope = 'global' | 'topic' | 'host'

export interface MemoryEntry {
  id: string
  type: MemoryType
  scope: MemoryScope
  content: string
  hostId?: string
  topicId?: string
  sourceTaskId?: string
  confidence?: number
  importance: number
  lastUsedAt?: number
  disabled?: boolean
  timestamp: number
}

export type GlobalMemoryFactCategory =
  | 'preference'
  | 'knowledge'
  | 'context'
  | 'behavior'
  | 'goal'
  | 'correction'

export interface GlobalMemoryContextSection {
  summary: string
  updatedAt?: number
}

export interface GlobalMemoryData {
  version: '1.0'
  lastUpdated: number
  user: {
    workContext: GlobalMemoryContextSection
    personalContext: GlobalMemoryContextSection
    topOfMind: GlobalMemoryContextSection
  }
  history: {
    recentMonths: GlobalMemoryContextSection
    earlierContext: GlobalMemoryContextSection
    longTermBackground: GlobalMemoryContextSection
  }
  facts: GlobalMemoryFact[]
}

export interface GlobalMemoryFact {
  id: string
  content: string
  category: GlobalMemoryFactCategory
  confidence: number
  createdAt: number
  updatedAt: number
  source: string
  sourceTaskId?: string
  sourceRunId?: string
  sourceError?: string
}
