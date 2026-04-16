/**
 * Row mapper functions for converting database rows to domain objects
 *
 * These functions provide a centralized way to map SQLite row types to domain types,
 * eliminating duplication across the codebase.
 */

import {
  Host,
  Topic,
  Message,
  Provider,
  Model,
  Task,
  TaskStep,
  Approval,
  Artifact,
  TerminalSession,
  TerminalIO,
  MemoryEntry,
  CommandPattern
} from '../../shared/types'

import {
  HostRow,
  TopicRow,
  MessageRow,
  ProviderRow,
  ModelRow,
  TaskRow,
  TaskStepRow,
  ApprovalRow,
  ArtifactRow,
  TerminalSessionRow,
  TerminalIORow,
  MemoryRow,
  CommandPatternRow
} from './row-types'

/**
 * Parse JSON string with fallback value
 */
export const parseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Map HostRow to Host
 */
export const mapHostRow = (row: HostRow): Host => ({
  id: row.id,
  alias: row.alias,
  ip: row.ip,
  port: row.port,
  username: row.username,
  password: row.password ?? undefined,
  keyPath: row.keyPath ?? undefined,
  tags: parseJSON(row.tags, []),
  createdAt: row.createdAt,
  agentNotes: row.agentNotes ?? undefined
})

/**
 * Map TopicRow to Topic
 */
export const mapTopicRow = (row: TopicRow): Topic => ({
  id: row.id,
  title: row.title,
  hostIds: parseJSON(row.hostIds, []),
  selectedProviderId: row.selectedProviderId ?? undefined,
  selectedModelId: row.selectedModelId ?? undefined,
  lastMessageAt: row.lastMessageAt,
  createdAt: row.createdAt
})

/**
 * Map MessageRow to Message
 */
export const mapMessageRow = (row: MessageRow): Message => ({
  id: row.id,
  topicId: row.topicId,
  role: row.role as Message['role'],
  content: row.content,
  timestamp: row.timestamp,
  thought: row.thought ?? undefined,
  toolCalls: parseJSON(row.toolCalls, undefined),
  toolCallId: row.toolCallId ?? undefined,
  name: row.name ?? undefined
})

/**
 * Map TaskRow to Task
 */
export const mapTaskRow = (row: TaskRow): Task => ({
  id: row.id,
  topicId: row.topicId,
  title: row.title,
  goal: row.goal,
  status: row.status as Task['status'],
  summary: row.summary ?? undefined,
  selectedProviderId: row.selectedProviderId ?? undefined,
  selectedModelId: row.selectedModelId ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

/**
 * Map TaskStepRow to TaskStep
 */
export const mapTaskStepRow = (row: TaskStepRow): TaskStep => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type as TaskStep['type'],
  status: row.status as TaskStep['status'],
  hostId: row.hostId ?? undefined,
  title: row.title ?? undefined,
  content: row.content,
  rawOutput: row.rawOutput ?? undefined,
  metadata: parseJSON<Record<string, unknown> | undefined>(row.metadata, undefined),
  startedAt: row.startedAt ?? undefined,
  endedAt: row.endedAt ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

/**
 * Map ApprovalRow to Approval
 */
export const mapApprovalRow = (row: ApprovalRow): Approval => ({
  id: row.id,
  taskId: row.taskId,
  stepId: row.stepId ?? undefined,
  command: row.command,
  riskLevel: row.riskLevel as Approval['riskLevel'],
  reason: row.reason ?? undefined,
  status: row.status as Approval['status'],
  createdAt: row.createdAt,
  respondedAt: row.respondedAt ?? undefined
})

/**
 * Map ArtifactRow to Artifact
 */
export const mapArtifactRow = (row: ArtifactRow): Artifact => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type as Artifact['type'],
  title: row.title,
  content: row.content,
  metadata: parseJSON<Record<string, unknown> | undefined>(row.metadata, undefined),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

/**
 * Map TerminalSessionRow to TerminalSession
 */
export const mapTerminalSessionRow = (row: TerminalSessionRow): TerminalSession => ({
  id: row.id,
  topicId: row.topicId,
  hostId: row.hostId,
  hostAlias: row.hostAlias,
  name: row.name ?? undefined,
  status: row.status as TerminalSession['status'],
  shellType: row.shellType ?? undefined,
  shellIntegrationReady: row.shellIntegrationReady === 1,
  createdAt: row.createdAt,
  closedAt: row.closedAt ?? undefined,
  agentNotes: row.agentNotes ?? undefined,
  isDeleted: row.isDeleted === 1,
  deletedAt: row.deletedAt ?? undefined,
  deletedBy: row.deletedBy ?? undefined
})

/**
 * Map TerminalIORow to TerminalIO
 */
export const mapTerminalIORow = (row: TerminalIORow): TerminalIO => ({
  id: row.id,
  sessionId: row.sessionId,
  topicId: row.topicId,
  hostId: row.hostId,
  type: row.type as TerminalIO['type'],
  source: row.source as TerminalIO['source'],
  content: row.content,
  exitCode: row.exitCode ?? undefined,
  durationMs: row.durationMs ?? undefined,
  relatedInputId: row.relatedInputId ?? undefined,
  isStreaming: row.isStreaming === 1,
  chunkIndex: row.chunkIndex,
  isTruncated: row.isTruncated === 1,
  cwd: row.cwd ?? undefined,
  taskId: row.taskId ?? undefined,
  stepId: row.stepId ?? undefined,
  timestamp: row.timestamp,
  isDeleted: row.isDeleted === 1,
  deletedAt: row.deletedAt ?? undefined,
  deletedBy: row.deletedBy ?? undefined
})

/**
 * Map MemoryRow to MemoryEntry
 */
export const mapMemoryRow = (row: MemoryRow): MemoryEntry => ({
  id: row.id,
  type: row.type as MemoryEntry['type'],
  content: row.content,
  hostId: row.hostId ?? undefined,
  topicId: row.topicId ?? undefined,
  importance: row.importance,
  timestamp: row.timestamp
})

/**
 * Map CommandPatternRow to CommandPattern
 */
export const mapCommandPatternRow = (row: CommandPatternRow): CommandPattern => ({
  id: row.id,
  hostId: row.hostId,
  commandPattern: row.commandPattern,
  approvalCount: row.approvalCount,
  rejectionCount: row.rejectionCount,
  trustLevel: row.trustLevel as CommandPattern['trustLevel'],
  lastSeen: row.lastSeen,
  createdAt: row.createdAt
})

/**
 * Map ProviderRow to Provider
 */
export const mapProviderRow = (row: ProviderRow): Provider => ({
  id: row.id,
  name: row.name,
  type: row.type as Provider['type'],
  apiKey: row.apiKey ?? '',
  apiHost: row.apiHost ?? '',
  apiVersion: row.apiVersion ?? undefined,
  enabled: row.enabled === 1,
  isSystem: row.isSystem === 1,
  config: parseJSON<Provider['config']>(row.config, undefined),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

/**
 * Map ModelRow to Model
 */
export const mapModelRow = (row: ModelRow): Model => ({
  id: row.id,
  providerId: row.providerId,
  name: row.name,
  group: row.group_name ?? undefined,
  capabilities: parseJSON<Model['capabilities']>(row.capabilities, []),
  endpointType: row.endpointType ?? undefined,
  pricing: parseJSON<Model['pricing']>(row.pricing, undefined),
  createdAt: row.createdAt
})
