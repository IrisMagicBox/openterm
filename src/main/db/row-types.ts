/**
 * Database row type definitions for OpenTerm
 *
 * These interfaces represent the raw SQLite row structures.
 * They match the database schema exactly, using raw types for JSON-encoded columns
 * and number (0/1) for boolean-like INTEGER columns.
 *
 * Mappers in db.ts convert these row types to domain objects.
 */

// hosts table
export interface HostRow {
  id: string
  alias: string
  ip: string
  port: number
  username: string
  password: string | null
  keyPath: string | null
  tags: string | null // JSON-encoded string[]
  createdAt: number
  agentNotes: string | null
}

// topics table
export interface TopicRow {
  id: string
  title: string
  hostIds: string // JSON-encoded string[]
  selectedProviderId: string | null
  selectedModelId: string | null
  lastMessageAt: number
  createdAt: number
}

// messages table
export interface MessageRow {
  id: string
  topicId: string
  role: string
  content: string
  thought: string | null
  toolCalls: string | null // JSON-encoded ToolCall[]
  toolCallId: string | null
  name: string | null
  timestamp: number
}

// tasks table
export interface TaskRow {
  id: string
  topicId: string
  title: string
  goal: string
  status: string
  summary: string | null
  selectedProviderId: string | null
  selectedModelId: string | null
  createdAt: number
  updatedAt: number
}

// task_steps table
export interface TaskStepRow {
  id: string
  taskId: string
  type: string
  status: string
  hostId: string | null
  title: string | null
  content: string
  rawOutput: string | null
  metadata: string | null // JSON-encoded Record<string, unknown>
  startedAt: number | null
  endedAt: number | null
  createdAt: number
  updatedAt: number
}

// approvals table
export interface ApprovalRow {
  id: string
  taskId: string
  stepId: string | null
  command: string
  riskLevel: string
  reason: string | null
  status: string
  createdAt: number
  respondedAt: number | null
}

// artifacts table
export interface ArtifactRow {
  id: string
  taskId: string
  type: string
  title: string
  content: string
  metadata: string | null // JSON-encoded Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// terminal_sessions table
export interface TerminalSessionRow {
  id: string
  topicId: string
  hostId: string
  hostAlias: string
  status: string
  shellType: string | null
  shellIntegrationReady: number // 0 or 1
  createdAt: number
  closedAt: number | null
  name: string | null // Added via ALTER TABLE
  agentNotes: string | null
  isDeleted: number // 0 or 1
  deletedAt: number | null
  deletedBy: string | null
}

// terminal_io table
export interface TerminalIORow {
  id: string
  sessionId: string
  topicId: string
  hostId: string
  type: string
  source: string
  content: string
  exitCode: number | null
  durationMs: number | null
  relatedInputId: string | null
  isStreaming: number // 0 or 1
  chunkIndex: number
  isTruncated: number // 0 or 1
  cwd: string | null
  taskId: string | null
  stepId: string | null
  timestamp: number
  isDeleted: number // 0 or 1
  deletedAt: number | null
  deletedBy: string | null
}

// memories table
export interface MemoryRow {
  id: string
  type: string
  content: string
  hostId: string | null
  topicId: string | null
  importance: number
  timestamp: number
}

// command_patterns table
export interface CommandPatternRow {
  id: string
  hostId: string
  commandPattern: string
  approvalCount: number
  rejectionCount: number
  trustLevel: string
  lastSeen: number
  createdAt: number
}

// model_settings table
export interface ModelSettingsRow {
  id: string
  apiKey: string
  baseURL: string
  model: string
  updatedAt: number
}

// providers table
export interface ProviderRow {
  id: string
  name: string
  type: string
  apiKey: string | null
  apiHost: string | null
  apiVersion: string | null
  enabled: number // 0 or 1, DEFAULT 1
  isSystem: number // 0 or 1, DEFAULT 0
  config: string | null // JSON-encoded Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// models table
export interface ModelRow {
  id: string
  providerId: string
  name: string
  group_name: string | null
  capabilities: string | null // JSON-encoded string[]
  endpointType: string | null
  pricing: string | null // JSON-encoded object
  createdAt: number
}

// permissions table
export interface PermissionRow {
  id: string
  requireConfirmation: number // 0 or 1, DEFAULT 1
  autoExecuteSafeOperations: number // 0 or 1, DEFAULT 1
  updatedAt: number
}
