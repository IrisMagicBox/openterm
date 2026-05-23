import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions/completions'
import type { AgentPart, Message } from '../../shared/types'
import type { CompactionMode } from './compaction'
import type { PendingVerificationCheckpoint } from './agent-checkpoint'
import { ToolCallLedger, type ToolCallLedgerEntry } from './tool-call-ledger'

export type AgentRunEvent =
  | {
      type: 'assistant_response'
      turn: number
      content: string
      toolCalls: ChatCompletionMessageFunctionToolCall[]
      assistantPartId?: string
      timestamp: number
    }
  | {
      type: 'tool_call_requested'
      turn: number
      toolCallId: string
      toolName: string
      signature: string
      args: Record<string, unknown>
      timestamp: number
    }
  | {
      type: 'tool_result'
      turn: number
      toolCallId: string
      toolName: string
      signature: string
      content: string
      observation?: string
      blocked?: boolean
      timestamp: number
    }
  | {
      type: 'runtime_observation'
      turn: number
      content: string
      timestamp: number
    }
  | {
      type: 'final'
      turn: number
      content: string
      timestamp: number
    }
  | {
      type: 'error'
      turn: number
      content: string
      timestamp: number
    }

export interface AgentRunStateSnapshot {
  turnCount: number
  workingHistory: Message[]
  events: AgentRunEvent[]
  compactedEventCount: number
  toolLedger: ToolCallLedgerEntry[]
  pendingVerifications: PendingVerificationCheckpoint[]
  lastCompactionMode?: CompactionMode
}

export interface AgentRunStateInput {
  turnCount?: number
  workingHistory: Message[]
  events?: AgentRunEvent[]
  compactedEventCount?: number
  toolLedger?: ToolCallLedgerEntry[]
  pendingVerifications?: PendingVerificationCheckpoint[]
  lastCompactionMode?: CompactionMode
}

export interface PendingAssistantTurn {
  turn: number
  assistantPartId?: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
}

export interface LatestAssistantResponse {
  turn: number
  assistantPartId?: string
  content: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
}

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  return JSON.stringify(content)
}

function toolNameForCall(
  toolCalls: ChatCompletionMessageFunctionToolCall[],
  toolCallId: string
): string {
  return toolCalls.find((call) => call.id === toolCallId)?.function.name ?? 'tool'
}

function cloneToolCall(
  call: ChatCompletionMessageFunctionToolCall
): ChatCompletionMessageFunctionToolCall {
  return {
    id: call.id,
    type: call.type,
    function: {
      name: call.function.name,
      arguments: call.function.arguments
    }
  }
}

function cloneEvent(event: AgentRunEvent): AgentRunEvent {
  if (event.type === 'assistant_response') {
    return {
      ...event,
      toolCalls: event.toolCalls.map(cloneToolCall)
    }
  }
  if (event.type === 'tool_call_requested') {
    return { ...event, args: { ...event.args } }
  }
  return { ...event }
}

function sortPersistedParts(parts: AgentPart[]): AgentPart[] {
  return [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
}

function sameToolCalls(
  left: ChatCompletionMessageFunctionToolCall[],
  right: ChatCompletionMessageFunctionToolCall[]
): boolean {
  if (left.length !== right.length) return false
  return left.every((call, index) => {
    const other = right[index]
    return (
      call.id === other.id &&
      call.type === other.type &&
      call.function.name === other.function.name &&
      call.function.arguments === other.function.arguments
    )
  })
}

export class AgentRunState {
  readonly ledger = new ToolCallLedger()
  turnCount: number
  workingHistory: Message[]
  events: AgentRunEvent[]
  compactedEventCount: number
  pendingVerifications: PendingVerificationCheckpoint[]
  lastCompactionMode?: CompactionMode

  constructor(input: AgentRunStateInput) {
    this.turnCount = input.turnCount ?? 1
    this.workingHistory = input.workingHistory.map((message) => ({
      ...message,
      metadata: message.metadata ? { ...message.metadata } : undefined
    }))
    this.events = (input.events ?? []).map(cloneEvent)
    this.compactedEventCount = Math.min(
      Math.max(0, input.compactedEventCount ?? 0),
      this.events.length
    )
    this.pendingVerifications = (input.pendingVerifications ?? []).map((item) => ({
      ...item,
      metadata: item.metadata ? { ...item.metadata } : undefined
    }))
    this.lastCompactionMode = input.lastCompactionMode
    this.ledger.restore(input.toolLedger ?? [])
    if ((input.toolLedger ?? []).length === 0) {
      this.rehydrateLedgerFromEvents()
    }
  }

  static fromV1Checkpoint(input: {
    turnCount: number
    workingHistory: Message[]
    turnMessages: ChatCompletionMessageParam[]
    pendingVerifications: PendingVerificationCheckpoint[]
    lastCompactionMode?: CompactionMode
  }): AgentRunState {
    const state = new AgentRunState({
      turnCount: input.turnCount,
      workingHistory: input.workingHistory,
      pendingVerifications: input.pendingVerifications,
      lastCompactionMode: input.lastCompactionMode
    })
    state.restoreTurnMessages(input.turnMessages)
    return state
  }

  appendAssistantResponse(input: {
    turn: number
    content: string
    toolCalls: ChatCompletionMessageFunctionToolCall[]
    assistantPartId?: string
  }): void {
    this.events.push({
      type: 'assistant_response',
      timestamp: Date.now(),
      ...input,
      toolCalls: input.toolCalls.map(cloneToolCall)
    })
    for (const call of input.toolCalls) {
      const args = this.safeParseArgs(call.function.arguments)
      this.events.push({
        type: 'tool_call_requested',
        turn: input.turn,
        toolCallId: call.id,
        toolName: call.function.name,
        signature: ToolCallLedger.signatureFor(call.function.name, args),
        args,
        timestamp: Date.now()
      })
    }
  }

  appendToolResult(input: {
    turn: number
    toolCallId: string
    toolName: string
    signature: string
    content: string
    observation?: string
    blocked?: boolean
  }): void {
    this.events.push({
      type: 'tool_result',
      timestamp: Date.now(),
      ...input
    })
    const requested = this.events.find(
      (event) => event.type === 'tool_call_requested' && event.toolCallId === input.toolCallId
    )
    const entry = this.ledger.recordObservation(
      input.toolName,
      requested?.type === 'tool_call_requested' ? requested.args : {},
      input.observation ?? input.content,
      input.blocked ? 'blocked' : undefined
    )
    if (input.observation !== undefined) {
      entry.lastObservation = input.observation
    }
    if (input.blocked) {
      entry.lastStatus = 'blocked'
    }
  }

  appendRuntimeObservation(turn: number, content: string): void {
    this.events.push({
      type: 'runtime_observation',
      turn,
      content,
      timestamp: Date.now()
    })
  }

  replaceToolCallSnapshot(
    toolCallId: string,
    call: ChatCompletionMessageFunctionToolCall,
    args: Record<string, unknown>
  ): void {
    for (const event of this.events) {
      if (event.type === 'assistant_response') {
        event.toolCalls = event.toolCalls.map((item) =>
          item.id === toolCallId ? cloneToolCall(call) : item
        )
      } else if (event.type === 'tool_call_requested' && event.toolCallId === toolCallId) {
        event.toolName = call.function.name
        event.args = { ...args }
        event.signature = ToolCallLedger.signatureFor(call.function.name, args)
      }
    }
  }

  appendFinal(turn: number, content: string): void {
    this.events.push({
      type: 'final',
      turn,
      content,
      timestamp: Date.now()
    })
  }

  appendError(turn: number, content: string): void {
    this.events.push({
      type: 'error',
      turn,
      content,
      timestamp: Date.now()
    })
  }

  setCompactedHistory(workingHistory: Message[], mode: CompactionMode): void {
    this.workingHistory = workingHistory
    this.lastCompactionMode = mode
    this.compactedEventCount = this.events.length
  }

  setPendingVerifications(items: PendingVerificationCheckpoint[]): void {
    this.pendingVerifications = items
  }

  hasToolResult(toolCallId: string): boolean {
    return this.events.some(
      (event) => event.type === 'tool_result' && event.toolCallId === toolCallId
    )
  }

  getLatestAssistantResponse(): LatestAssistantResponse | undefined {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]
      if (event.type !== 'assistant_response') continue
      return {
        turn: event.turn,
        assistantPartId: event.assistantPartId,
        content: event.content,
        toolCalls: event.toolCalls.map(cloneToolCall)
      }
    }
    return undefined
  }

  getPendingAssistantTurn(): PendingAssistantTurn | undefined {
    const latest = this.getLatestAssistantTurn()
    if (!latest || latest.pendingToolCalls.length === 0) return undefined
    return {
      turn: latest.turn,
      assistantPartId: latest.assistantPartId,
      toolCalls: latest.pendingToolCalls.map(cloneToolCall)
    }
  }

  getLatestAssistantTurn():
    | {
        turn: number
        assistantPartId?: string
        toolCalls: ChatCompletionMessageFunctionToolCall[]
        pendingToolCalls: ChatCompletionMessageFunctionToolCall[]
        completed: boolean
      }
    | undefined {
    const latest = this.getLatestAssistantResponse()
    if (!latest || latest.toolCalls.length === 0) return undefined

    const completedToolCallIds = new Set(
      this.events
        .filter((event): event is Extract<AgentRunEvent, { type: 'tool_result' }> => {
          return event.type === 'tool_result'
        })
        .map((event) => event.toolCallId)
    )

    const pendingToolCalls = latest.toolCalls.filter((call) => !completedToolCallIds.has(call.id))
    return {
      turn: latest.turn,
      assistantPartId: latest.assistantPartId,
      toolCalls: latest.toolCalls.map(cloneToolCall),
      pendingToolCalls: pendingToolCalls.map(cloneToolCall),
      completed: pendingToolCalls.length === 0
    }
  }

  reconcileToolResultsFromParts(parts: AgentPart[]): number {
    const requestedByToolCallId = new Map<
      string,
      {
        turn: number
        toolName: string
        args: Record<string, unknown>
        signature: string
      }
    >()
    const completedToolCallIds = new Set(
      this.events
        .filter((event): event is Extract<AgentRunEvent, { type: 'tool_result' }> => {
          return event.type === 'tool_result'
        })
        .map((event) => event.toolCallId)
    )

    for (const event of this.events) {
      if (event.type !== 'assistant_response') continue
      for (const call of event.toolCalls) {
        const args = this.safeParseArgs(call.function.arguments)
        requestedByToolCallId.set(call.id, {
          turn: event.turn,
          toolName: call.function.name,
          args,
          signature: ToolCallLedger.signatureFor(call.function.name, args)
        })
      }
    }

    let appended = 0
    for (const part of sortPersistedParts(parts)) {
      if (part.type !== 'tool' || !part.toolCallId) continue
      if (part.status === 'pending' || part.status === 'running') continue
      if (completedToolCallIds.has(part.toolCallId)) continue

      const requested = requestedByToolCallId.get(part.toolCallId)
      if (!requested) continue

      this.appendToolResult({
        turn: requested.turn,
        toolCallId: part.toolCallId,
        toolName: part.toolName ?? requested.toolName,
        signature: requested.signature,
        content: part.output || part.error || '',
        observation:
          typeof part.metadata?.observation === 'string' ? part.metadata.observation : undefined,
        blocked: part.status === 'blocked'
      })
      completedToolCallIds.add(part.toolCallId)
      appended += 1
    }

    return appended
  }

  hydrateLatestAssistantTurnFromParts(parts: AgentPart[]): number {
    const sortedParts = sortPersistedParts(parts)
    const knownToolCallIds = new Set(
      this.events
        .filter((event): event is Extract<AgentRunEvent, { type: 'tool_call_requested' }> => {
          return event.type === 'tool_call_requested'
        })
        .map((event) => event.toolCallId)
    )
    const latestAssistantIndex = [...sortedParts].reverse().findIndex((part) => {
      return part.role === 'assistant' && part.type === 'text'
    })

    let assistantPart: AgentPart | undefined
    let toolParts: AgentPart[] = []
    if (latestAssistantIndex !== -1) {
      const actualIndex = sortedParts.length - 1 - latestAssistantIndex
      assistantPart = sortedParts[actualIndex]
      toolParts = sortedParts
        .slice(actualIndex + 1)
        .filter((part) => part.type === 'tool' && part.toolCallId)
    } else {
      let index = sortedParts.length - 1
      while (index >= 0 && sortedParts[index].type !== 'tool') {
        index -= 1
      }
      for (; index >= 0; index -= 1) {
        const part = sortedParts[index]
        if (part.type !== 'tool' || !part.toolCallId) break
        if (knownToolCallIds.has(part.toolCallId)) break
        toolParts.unshift(part)
      }
    }

    if (!assistantPart && toolParts.length === 0) return 0

    const toolCalls = toolParts.map((part) => ({
      id: part.toolCallId as string,
      type: 'function' as const,
      function: {
        name: part.toolName ?? 'tool',
        arguments: part.input ?? '{}'
      }
    }))
    const assistantContent = contentToString(assistantPart?.output ?? assistantPart?.error ?? '')

    const alreadyPresent = this.events.some((event) => {
      if (event.type !== 'assistant_response') return false
      if (assistantPart?.id && event.assistantPartId === assistantPart.id) return true
      if (event.content !== assistantContent) return false
      return sameToolCalls(event.toolCalls, toolCalls)
    })
    if (alreadyPresent) return 0

    this.appendAssistantResponse({
      turn: this.turnCount,
      content: assistantContent,
      toolCalls,
      assistantPartId: assistantPart?.id
    })

    if (toolCalls.length > 0) {
      const parsedCalls = toolCalls.map((call) => ({
        call,
        args: this.safeParseArgs(call.function.arguments)
      }))
      this.ledger.registerAttempts(parsedCalls, this.turnCount)
    }

    return 1 + toolCalls.length
  }

  toModelMessages(): ChatCompletionMessageParam[] {
    return this.toRawModelMessages(this.contextEvents())
  }

  toSummaryModelMessages(): ChatCompletionMessageParam[] {
    return this.compressDuplicateToolMessages(this.toRawModelMessages(this.contextEvents()))
  }

  toRuntimeMessages(runId: string, topicId: string, taskId: string): Message[] {
    const now = Date.now()
    const turnMessages = this.toRawModelMessages(this.contextEvents()).map((message, index) => {
      const record = message as unknown as Record<string, unknown>
      const role: Message['role'] =
        record.role === 'tool' ? 'tool' : record.role === 'assistant' ? 'assistant' : 'user'
      return {
        id: `turn_${runId}_${now}_${index}`,
        topicId,
        runId,
        role,
        content: contentToString(record.content),
        timestamp: now + index,
        toolCalls: Array.isArray(record.tool_calls)
          ? (record.tool_calls as Message['toolCalls'])
          : undefined,
        toolCallId: typeof record.tool_call_id === 'string' ? record.tool_call_id : undefined,
        name: typeof record.name === 'string' ? record.name : undefined,
        metadata: { taskId }
      }
    })
    return [
      ...this.workingHistory.map((message) => ({
        ...message,
        topicId: message.topicId || topicId,
        runId: message.runId ?? runId,
        metadata: {
          ...message.metadata,
          taskId: message.metadata?.taskId ?? taskId
        }
      })),
      ...turnMessages
    ]
  }

  snapshot(): AgentRunStateSnapshot {
    return {
      turnCount: this.turnCount,
      workingHistory: this.workingHistory.map((message) => ({
        ...message,
        metadata: message.metadata ? { ...message.metadata } : undefined
      })),
      events: this.events.map(cloneEvent),
      compactedEventCount: this.compactedEventCount,
      toolLedger: this.ledger.snapshot(),
      pendingVerifications: this.pendingVerifications.map((item) => ({
        ...item,
        metadata: item.metadata ? { ...item.metadata } : undefined
      })),
      lastCompactionMode: this.lastCompactionMode
    }
  }

  private restoreTurnMessages(messages: ChatCompletionMessageParam[]): void {
    let currentAssistant:
      | {
          turn: number
          toolCalls: ChatCompletionMessageFunctionToolCall[]
        }
      | undefined
    let turn = 1

    for (const message of messages) {
      const record = message as unknown as Record<string, unknown>
      if (record.role === 'assistant') {
        const toolCalls = Array.isArray(record.tool_calls)
          ? (record.tool_calls as ChatCompletionMessageFunctionToolCall[])
          : []
        this.appendAssistantResponse({
          turn,
          content: contentToString(record.content),
          toolCalls
        })
        for (const call of toolCalls) {
          const args = this.safeParseArgs(call.function.arguments)
          this.ledger.registerAttempts([{ call, args }], turn)
        }
        currentAssistant = { turn, toolCalls }
        continue
      }

      if (record.role === 'tool' && typeof record.tool_call_id === 'string') {
        const toolCall = currentAssistant?.toolCalls.find((call) => call.id === record.tool_call_id)
        const toolName = toolNameForCall(currentAssistant?.toolCalls ?? [], record.tool_call_id)
        const args = toolCall ? this.safeParseArgs(toolCall.function.arguments) : {}
        const signature = ToolCallLedger.signatureFor(toolName, args)
        const content = contentToString(record.content)
        this.appendToolResult({
          turn: currentAssistant?.turn ?? turn,
          toolCallId: record.tool_call_id,
          toolName,
          signature,
          content
        })
        continue
      }

      this.appendRuntimeObservation(turn, contentToString(record.content))
      turn += 1
    }
  }

  private contextEvents(): AgentRunEvent[] {
    return this.events.slice(this.compactedEventCount)
  }

  private toRawModelMessages(events: AgentRunEvent[]): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = []

    for (const event of events) {
      if (event.type === 'assistant_response') {
        result.push({
          role: 'assistant',
          content: event.content,
          tool_calls: event.toolCalls
        })
      } else if (event.type === 'tool_call_requested') {
        continue
      } else if (event.type === 'tool_result') {
        result.push({
          role: 'tool',
          tool_call_id: event.toolCallId,
          content: event.observation ?? event.content
        })
      } else if (event.type === 'runtime_observation') {
        result.push({ role: 'user', content: event.content })
      }
    }

    return result
  }

  private compressDuplicateToolMessages(
    messages: ChatCompletionMessageParam[]
  ): ChatCompletionMessageParam[] {
    const signatureByToolCallId = new Map<string, string>()
    const toolNameByToolCallId = new Map<string, string>()
    const toolIndexesBySignature = new Map<string, number[]>()

    for (let index = 0; index < messages.length; index++) {
      const message = messages[index] as unknown as Record<string, unknown>
      if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls as ChatCompletionMessageFunctionToolCall[]) {
          const args = this.safeParseArgs(call.function.arguments)
          const signature = ToolCallLedger.signatureFor(call.function.name, args)
          signatureByToolCallId.set(call.id, signature)
          toolNameByToolCallId.set(call.id, call.function.name)
        }
        continue
      }

      if (message.role !== 'tool' || typeof message.tool_call_id !== 'string') continue
      const signature = signatureByToolCallId.get(message.tool_call_id)
      if (!signature) continue
      const indexes = toolIndexesBySignature.get(signature) ?? []
      indexes.push(index)
      toolIndexesBySignature.set(signature, indexes)
    }

    const replaceIndexes = new Set<number>()
    for (const indexes of toolIndexesBySignature.values()) {
      for (const index of indexes.slice(0, -1)) replaceIndexes.add(index)
    }

    if (replaceIndexes.size === 0) return messages

    return messages.map((message, index) => {
      if (!replaceIndexes.has(index)) return message
      const record = message as unknown as Record<string, unknown>
      const toolCallId = String(record.tool_call_id)
      const toolName = toolNameByToolCallId.get(toolCallId) ?? toolNameForCall([], toolCallId)
      const content = contentToString(record.content)
      return {
        role: 'tool',
        tool_call_id: toolCallId,
        content: `[Runtime observation] 该 ${toolName} 工具调用结果与后续重复调用相同，旧结果已压缩。摘要：\n${content.slice(
          0,
          600
        )}${content.length > 600 ? '\n...[truncated]' : ''}`
      } satisfies ChatCompletionMessageParam
    })
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || '{}') as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private rehydrateLedgerFromEvents(): void {
    const argsByToolCallId = new Map<string, Record<string, unknown>>()
    for (const event of this.events) {
      if (event.type === 'tool_call_requested') {
        argsByToolCallId.set(event.toolCallId, event.args)
        const call: ChatCompletionMessageFunctionToolCall = {
          id: event.toolCallId,
          type: 'function',
          function: {
            name: event.toolName,
            arguments: JSON.stringify(event.args ?? {})
          }
        }
        this.ledger.registerAttempts([{ call, args: event.args }], event.turn)
      } else if (event.type === 'tool_result') {
        this.ledger.recordObservation(
          event.toolName,
          argsByToolCallId.get(event.toolCallId) ?? {},
          event.observation ?? event.content,
          event.blocked ? 'blocked' : undefined
        )
      }
    }
  }
}
