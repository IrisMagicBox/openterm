import type {
  AgentPartStatus,
  AgentPartType,
  AgentRunStopReason,
  AgentRunStatus
} from '../../shared/types'
import type { TokenUsage } from './provider-adapter'

export type AgentRuntimeEvent =
  | {
      type: 'stream:start'
      runId: string
      timestamp: number
    }
  | {
      type: 'stream:text-delta'
      runId: string
      partId?: string
      delta: string
      output: string
      timestamp: number
    }
  | {
      type: 'stream:reasoning-delta'
      runId: string
      partId?: string
      delta: string
      output: string
      timestamp: number
    }
  | {
      type: 'stream:finish'
      runId: string
      finishReason: string | null
      usage?: TokenUsage
      timestamp: number
    }
  | {
      type: 'tool:input'
      runId: string
      partId?: string
      toolCallId: string
      toolName: string
      input: string
      timestamp: number
    }
  | {
      type: 'tool:result'
      runId: string
      partId?: string
      toolCallId: string
      toolName: string
      output: string
      metadata?: Record<string, unknown>
      timestamp: number
    }
  | {
      type: 'tool:error'
      runId: string
      partId?: string
      toolCallId: string
      toolName: string
      error: string
      timestamp: number
    }
  | {
      type: 'permission:asked'
      runId: string
      partId?: string
      pattern: string
      timestamp: number
    }
  | {
      type: 'permission:replied'
      runId: string
      partId?: string
      approved: boolean
      feedback?: string
      timestamp: number
    }
  | {
      type: 'runtime:usage'
      runId: string
      usage: TokenUsage
      timestamp: number
    }
  | {
      type: 'runtime:part'
      runId: string
      partId: string
      partType: AgentPartType
      status: AgentPartStatus
      timestamp: number
    }
  | {
      type: 'runtime:run-status'
      runId: string
      status: AgentRunStatus
      stopReason?: AgentRunStopReason
      timestamp: number
    }
  | {
      type: 'runtime:compaction'
      runId: string
      partId?: string
      status: AgentPartStatus
      metadata?: Record<string, unknown>
      timestamp: number
    }
  | {
      type: 'runtime:retry'
      runId: string
      attempt: number
      error: string
      retryable: boolean
      timestamp: number
    }
  | {
      type: 'runtime:abort'
      runId: string
      reason: string
      timestamp: number
    }
  | {
      type: 'runtime:error'
      runId: string
      error: string
      stopReason?: AgentRunStopReason
      timestamp: number
    }
