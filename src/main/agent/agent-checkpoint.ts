import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message, PolicyRiskCategory } from '../../shared/types'
import { agentRunCheckpointDB } from '../db'
import { agentRunStore } from './agent-run-store'
import type { CompactionMode } from './compaction'

export const AGENT_CHECKPOINT_SCHEMA_VERSION = 1

export interface PendingVerificationCheckpoint {
  id: string
  hostId: string
  toolName: string
  command: string
  riskCategory: PolicyRiskCategory
  metadata?: Record<string, unknown>
  createdAt: number
}

export interface AgentRunCheckpointPayload {
  schemaVersion: typeof AGENT_CHECKPOINT_SCHEMA_VERSION
  turnCount: number
  workingHistory: Message[]
  turnMessages: ChatCompletionMessageParam[]
  pendingVerifications: PendingVerificationCheckpoint[]
  updatedAt: number
  lastCompactionMode?: CompactionMode
}

function isCheckpointPayload(value: unknown): value is AgentRunCheckpointPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === AGENT_CHECKPOINT_SCHEMA_VERSION &&
    typeof record.turnCount === 'number' &&
    Array.isArray(record.workingHistory) &&
    Array.isArray(record.turnMessages) &&
    Array.isArray(record.pendingVerifications)
  )
}

export class AgentCheckpointStore {
  get(runId: string): AgentRunCheckpointPayload | undefined {
    const checkpoint = agentRunCheckpointDB.getCheckpoint(runId)
    if (!checkpoint || !isCheckpointPayload(checkpoint.payload)) return undefined
    return checkpoint.payload
  }

  save(
    runId: string,
    input: Omit<AgentRunCheckpointPayload, 'schemaVersion' | 'updatedAt'> & {
      updatedAt?: number
    }
  ): AgentRunCheckpointPayload {
    const updatedAt = input.updatedAt ?? Date.now()
    const payload: AgentRunCheckpointPayload = {
      schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
      turnCount: input.turnCount,
      workingHistory: input.workingHistory,
      turnMessages: input.turnMessages,
      pendingVerifications: input.pendingVerifications,
      lastCompactionMode: input.lastCompactionMode,
      updatedAt
    }

    agentRunCheckpointDB.upsertCheckpoint(runId, payload as unknown as Record<string, unknown>)
    agentRunStore.updateRun(runId, {
      metadata: {
        latestCheckpointReport: {
          updatedAt,
          turnCount: payload.turnCount,
          pendingVerificationCount: payload.pendingVerifications.length,
          compactionMode: payload.lastCompactionMode
        }
      }
    })
    return payload
  }

  delete(runId: string): void {
    agentRunCheckpointDB.deleteCheckpoint(runId)
  }
}

export const agentCheckpointStore = new AgentCheckpointStore()
