/**
 * Typed event bus for OpenTerm main process.
 *
 * Replaces ad-hoc webContents.send() calls with a centralized, typed
 * pub/sub system. Events are defined as typed constants with Zod-validated
 * payloads for type safety and runtime validation.
 */

import { z } from 'zod'
import { logger } from '../logger'
import type { WebContents } from 'electron'

// ─── Event definitions ──────────────────────────────────────────

export const AgentEvents = {
  Step: z.object({
    topicId: z.string(),
    taskId: z.string(),
    stepId: z.string().optional(),
    role: z.enum(['user', 'assistant', 'tool']),
    content: z.string(),
    agentStatus: z.enum(['thinking', 'executing', 'verifying', 'done', 'error']).optional()
  }),

  Thinking: z.object({
    topicId: z.string(),
    taskId: z.string()
  }),

  ToolCall: z.object({
    topicId: z.string(),
    taskId: z.string(),
    toolName: z.string(),
    args: z.record(z.unknown())
  }),

  ToolResult: z.object({
    topicId: z.string(),
    taskId: z.string(),
    toolName: z.string(),
    output: z.string(),
    error: z.boolean().optional()
  }),

  TaskComplete: z.object({
    topicId: z.string(),
    taskId: z.string(),
    status: z.enum(['completed', 'failed']),
    summary: z.string()
  }),

  DoomLoop: z.object({
    topicId: z.string(),
    taskId: z.string(),
    toolName: z.string(),
    callCount: z.number()
  }),

  AutoCompact: z.object({
    topicId: z.string(),
    taskId: z.string(),
    originalTokens: z.number(),
    compactedTokens: z.number()
  }),

  Usage: z.object({
    topicId: z.string(),
    taskId: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cachedTokens: z.number(),
    totalTokens: z.number(),
    llmCalls: z.number()
  }),

  SubagentComplete: z.object({
    topicId: z.string(),
    taskId: z.string(),
    subagentSessionId: z.string(),
    subagentType: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
    llmCalls: z.number()
  })
} as const

export const TerminalEvents = {
  CommandStart: z.object({
    topicId: z.string(),
    sessionId: z.string(),
    command: z.string()
  }),

  CommandEnd: z.object({
    topicId: z.string(),
    sessionId: z.string(),
    exitCode: z.number(),
    durationMs: z.number()
  }),

  Output: z.object({
    topicId: z.string(),
    sessionId: z.string(),
    content: z.string(),
    isStream: z.boolean()
  }),

  SessionCreated: z.object({
    topicId: z.string(),
    sessionId: z.string(),
    hostId: z.string(),
    name: z.string()
  }),

  SessionClosed: z.object({
    sessionId: z.string()
  })
} as const

export const PermissionEvents = {
  Asked: z.object({
    topicId: z.string(),
    taskId: z.string(),
    command: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    reason: z.string()
  }),

  Responded: z.object({
    topicId: z.string(),
    approved: z.boolean(),
    alwaysAllow: z.boolean()
  })
} as const

// ─── Event map ──────────────────────────────────────────────────

export type EventMap = {
  'agent:step': z.infer<typeof AgentEvents.Step>
  'agent:thinking': z.infer<typeof AgentEvents.Thinking>
  'agent:tool-call': z.infer<typeof AgentEvents.ToolCall>
  'agent:tool-result': z.infer<typeof AgentEvents.ToolResult>
  'agent:task-complete': z.infer<typeof AgentEvents.TaskComplete>
  'agent:doom-loop': z.infer<typeof AgentEvents.DoomLoop>
  'agent:auto-compact': z.infer<typeof AgentEvents.AutoCompact>
  'agent:usage': z.infer<typeof AgentEvents.Usage>
  'agent:subagent-complete': z.infer<typeof AgentEvents.SubagentComplete>
  'terminal:command-start': z.infer<typeof TerminalEvents.CommandStart>
  'terminal:command-end': z.infer<typeof TerminalEvents.CommandEnd>
  'terminal:output': z.infer<typeof TerminalEvents.Output>
  'terminal:session-created': z.infer<typeof TerminalEvents.SessionCreated>
  'terminal:session-closed': z.infer<typeof TerminalEvents.SessionClosed>
  'permission:asked': z.infer<typeof PermissionEvents.Asked>
  'permission:responded': z.infer<typeof PermissionEvents.Responded>
}

export type EventName = keyof EventMap

// ─── Schema lookup ──────────────────────────────────────────────

const eventSchemas: Record<EventName, z.ZodType> = {
  'agent:step': AgentEvents.Step,
  'agent:thinking': AgentEvents.Thinking,
  'agent:tool-call': AgentEvents.ToolCall,
  'agent:tool-result': AgentEvents.ToolResult,
  'agent:task-complete': AgentEvents.TaskComplete,
  'agent:doom-loop': AgentEvents.DoomLoop,
  'agent:auto-compact': AgentEvents.AutoCompact,
  'agent:usage': AgentEvents.Usage,
  'agent:subagent-complete': AgentEvents.SubagentComplete,
  'terminal:command-start': TerminalEvents.CommandStart,
  'terminal:command-end': TerminalEvents.CommandEnd,
  'terminal:output': TerminalEvents.Output,
  'terminal:session-created': TerminalEvents.SessionCreated,
  'terminal:session-closed': TerminalEvents.SessionClosed,
  'permission:asked': PermissionEvents.Asked,
  'permission:responded': PermissionEvents.Responded
}

// ─── EventBus class ─────────────────────────────────────────────

type Handler<T> = (payload: T) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>()
  private webContents: WebContents | null = null

  /** Set the WebContents for forwarding events to renderer */
  setWebContents(wc: WebContents): void {
    this.webContents = wc
  }

  /** Subscribe to an event */
  on<E extends EventName>(event: E, handler: Handler<EventMap[E]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    const set = this.handlers.get(event)!
    set.add(handler as Handler<unknown>)

    return () => {
      set.delete(handler as Handler<unknown>)
    }
  }

  /** Publish an event to all subscribers and forward to renderer */
  publish<E extends EventName>(event: E, payload: EventMap[E]): void {
    const schema = eventSchemas[event]
    const result = schema.safeParse(payload)
    if (!result.success) {
      logger.error('EventBus', `Invalid payload for ${event}`, result.error.issues)
      return
    }

    // Notify local subscribers
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload)
        } catch (err) {
          logger.error('EventBus', `Handler error for ${event}`, err)
        }
      }
    }

    // Forward to renderer process
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send(event, payload)
    }
  }

  /** Remove all handlers */
  clear(): void {
    this.handlers.clear()
  }
}

// Singleton instance
export const eventBus = new EventBus()
