import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { Message, PolicyRiskCategory } from '../../shared/types'
import { agentRunCheckpointDB } from '../db'
import { agentRunStore } from './agent-run-store'
import type { CompactionMode } from './compaction'
import { AgentRunState, type AgentRunStateSnapshot } from './agent-run-state'

export const AGENT_CHECKPOINT_SCHEMA_VERSION = 2
export const AGENT_CHECKPOINT_SCHEMA_VERSION_V1 = 1

export interface PendingVerificationCheckpoint {
  id: string
  hostId: string
  toolName: string
  command: string
  riskCategory: PolicyRiskCategory
  metadata?: Record<string, unknown>
  createdAt: number
}

export interface AgentRunCheckpointV1Payload {
  schemaVersion: typeof AGENT_CHECKPOINT_SCHEMA_VERSION_V1
  turnCount: number
  workingHistory: Message[]
  turnMessages: ChatCompletionMessageParam[]
  pendingVerifications: PendingVerificationCheckpoint[]
  updatedAt: number
  lastCompactionMode?: CompactionMode
}

export interface AgentRunCheckpointPayload {
  schemaVersion: typeof AGENT_CHECKPOINT_SCHEMA_VERSION
  state: AgentRunStateSnapshot
  updatedAt: number
}

function isV1CheckpointPayload(value: unknown): value is AgentRunCheckpointV1Payload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === AGENT_CHECKPOINT_SCHEMA_VERSION_V1 &&
    typeof record.turnCount === 'number' &&
    Array.isArray(record.workingHistory) &&
    Array.isArray(record.turnMessages) &&
    Array.isArray(record.pendingVerifications)
  )
}

function isV2CheckpointPayload(value: unknown): value is AgentRunCheckpointPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const state = record.state as Record<string, unknown> | undefined
  return (
    record.schemaVersion === AGENT_CHECKPOINT_SCHEMA_VERSION &&
    !!state &&
    typeof state.turnCount === 'number' &&
    Array.isArray(state.workingHistory) &&
    Array.isArray(state.events) &&
    Array.isArray(state.toolLedger) &&
    Array.isArray(state.pendingVerifications) &&
    (state.compactedEventCount === undefined || typeof state.compactedEventCount === 'number')
  )
}

export class AgentCheckpointStore {
  get(runId: string): AgentRunCheckpointPayload | undefined {
    const checkpoint = agentRunCheckpointDB.getCheckpoint(runId)
    if (!checkpoint) return undefined
    if (isV2CheckpointPayload(checkpoint.payload)) {
      return {
        ...checkpoint.payload,
        state: new AgentRunState(checkpoint.payload.state).snapshot()
      }
    }
    if (!isV1CheckpointPayload(checkpoint.payload)) return undefined

    const state = AgentRunState.fromV1Checkpoint({
      turnCount: checkpoint.payload.turnCount,
      workingHistory: checkpoint.payload.workingHistory,
      turnMessages: checkpoint.payload.turnMessages,
      pendingVerifications: checkpoint.payload.pendingVerifications,
      lastCompactionMode: checkpoint.payload.lastCompactionMode
    }).snapshot()
    return {
      schemaVersion: AGENT_CHECKPOINT_SCHEMA_VERSION,
      state,
      updatedAt: checkpoint.payload.updatedAt
    }
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
      state: input.state,
      updatedAt
    }

    agentRunCheckpointDB.upsertCheckpoint(runId, payload as unknown as Record<string, unknown>)
    agentRunStore.updateRun(runId, {
      metadata: {
        latestCheckpointReport: {
          updatedAt,
          turnCount: payload.state.turnCount,
          eventCount: payload.state.events.length,
          compactedEventCount: payload.state.compactedEventCount,
          ledgerEntryCount: payload.state.toolLedger.length,
          repeatedToolCallCount: payload.state.toolLedger.reduce(
            (sum, entry) => sum + entry.repeatCount,
            0
          ),
          pendingVerificationCount: payload.state.pendingVerifications.length,
          compactionMode: payload.state.lastCompactionMode
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
