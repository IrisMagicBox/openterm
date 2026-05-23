import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { v4 as uuidv4 } from 'uuid'
import { getErrorMessage } from '../../shared/errors'
import type { AgentPart, PolicyRiskCategory, TaskStep, ToolResult } from '../../shared/types'
import { taskStepDB } from '../db'
import { MemoryManager } from '../MemoryManager'
import { executeGrouped } from './session-scheduler'
import { fromCommandResult, formatObservation } from '../tools/observation'
import { ToolContextFactory } from '../tools/tool-context-factory'
import { getSearchTimeContext, normalizeCurrentNewsQuery } from '../tools/websearch'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import type { AgentProcessorOptions } from './agent-processor-types'
import type { SessionUsage } from './provider-adapter'
import { AgentPartProjection } from './agent-part-projection'
import type { PendingVerificationCheckpoint } from './agent-checkpoint'
import type { ToolCallAttempt } from './tool-call-ledger'

export interface ToolCallExecutionObservation {
  role: 'tool'
  tool_call_id: string
  content: string
  toolName: string
  args: Record<string, unknown>
  call: ChatCompletionMessageFunctionToolCall
}

export class ToolCallExecutor {
  private readonly legacyEvents: LegacyAgentEventAdapter
  private readonly contextFactory: ToolContextFactory
  private readonly parts = new AgentPartProjection()
  private readonly pendingVerifications = new Map<string, PendingVerification>()
  private currentTurnId?: string

  constructor(private readonly options: AgentProcessorOptions) {
    this.legacyEvents = new LegacyAgentEventAdapter(options.run, options.context)
    this.contextFactory = new ToolContextFactory({
      context: options.context,
      runId: options.run.id,
      config: options.config,
      permissionEngine: options.permissionEngine
    })
  }

  reset(): void {
    this.pendingVerifications.clear()
  }

  getTools(turnCount: number, maxTurns: number, allowFinalTurnTools = false): ChatCompletionTool[] {
    if (turnCount === maxTurns && !allowFinalTurnTools) return []
    return this.options.toolRegistry
      .getFilteredDefinitions(this.options.config.name)
      .filter((tool) => this.options.permissionEngine.isToolAllowed(tool.function.name))
  }

  hasPendingVerification(): boolean {
    return this.pendingVerifications.size > 0
  }

  getPendingVerificationSnapshot(): PendingVerificationCheckpoint[] {
    return Array.from(this.pendingVerifications.values()).map((item) => ({ ...item }))
  }

  restorePendingVerifications(items: PendingVerificationCheckpoint[] = []): void {
    this.pendingVerifications.clear()
    for (const item of items) {
      this.pendingVerifications.set(item.id, { ...item })
    }
  }

  setTurnContext(turnCount: number): void {
    this.currentTurnId = `${this.options.run.id}:${turnCount}`
  }

  getVerificationObservation(): string {
    const pending = Array.from(this.pendingVerifications.values())
    const lines = pending.map(
      (item) =>
        `- verificationId=${item.id}, host=${item.hostId}, tool=${item.toolName}, category=${item.riskCategory}, command=${item.command}`
    )
    return [
      '[Runtime observation] 你刚才执行了会修改系统状态的操作，但还没有提供只读验证证据。',
      '请继续使用 execute_command 执行只读验证命令，并在 verificationIds 参数中带上对应 verificationId，确认修改结果后再给出最终回答。',
      '待验证操作：',
      ...lines
    ].join('\n')
  }

  async executeToolCalls(
    toolCalls: ChatCompletionMessageFunctionToolCall[] | ToolCallAttempt[]
  ): Promise<ToolCallExecutionObservation[]> {
    const safeCalls: ChatCompletionMessageFunctionToolCall[] = []
    const safeCallArgs = new Map<string, Record<string, unknown>>()
    const safeCallPartIds = new Map<string, string>()
    const observations: ToolCallExecutionObservation[] = []
    if (this.options.context.abort?.aborted) return observations

    for (const item of toolCalls) {
      if (this.options.context.abort?.aborted) break
      const call = this.asToolCall(item)
      this.repairToolCallName(call)
      this.normalizeVisibleToolArguments(call)
      const part = this.ensureToolPart(call)
      this.annotateAttemptDiagnostics(item, part)
      const parsed = this.isToolCallAttempt(item)
        ? { ok: true as const, args: item.args }
        : this.parseToolArguments(call, part)
      if (!parsed.ok) {
        observations.push(this.makeObservation(call, {}, parsed.error))
        continue
      }

      if (call.function.name === 'invalid_tool') {
        const error =
          typeof parsed.args.error === 'string'
            ? `Error: ${parsed.args.error}`
            : `Error: Unknown tool "${String(parsed.args.tool ?? 'unknown')}".`
        this.parts.failToolCallPart(part.id, { error })
        observations.push(this.makeObservation(call, parsed.args, error))
        continue
      }

      if (!this.options.permissionEngine.isToolAllowed(call.function.name)) {
        const error = `Error: Tool "${call.function.name}" is not allowed for agent "${this.options.config.name}".`
        this.parts.failToolCallPart(part.id, { error })
        observations.push(this.makeObservation(call, parsed.args, error))
        continue
      }

      const validation = this.validateToolArguments(call, parsed.args, part)
      if (!validation.ok) {
        observations.push(this.makeObservation(call, parsed.args, validation.error))
        continue
      }

      safeCalls.push(call)
      safeCallArgs.set(call.id, validation.args)
      safeCallPartIds.set(call.id, part.id)
    }

    if (safeCalls.length === 0) return observations

    this.legacyEvents.status('executing')
    const results = await executeGrouped(
      safeCalls,
      (call) => this.executeTool(call),
      this.options.context.abort
    )
    if (this.options.context.abort?.aborted) return observations
    for (const call of safeCalls) {
      const result = results.get(call.id)
      if (!result) continue
      const observation = await this.formatObservation(call, result)
      const partId = safeCallPartIds.get(call.id)
      if (partId) this.parts.annotateToolObservation(partId, observation)
      const args = safeCallArgs.get(call.id)
      observations.push(this.makeObservation(call, args ?? {}, observation))
    }

    return observations
  }

  private async executeTool(call: ChatCompletionMessageFunctionToolCall): Promise<ToolResult> {
    if (this.options.context.abort?.aborted) {
      return { toolCallId: call.id, content: 'Error: Run cancelled' }
    }
    this.repairToolCallName(call)
    this.normalizeVisibleToolArguments(call)
    const part = this.ensureToolPart(call)
    const parsed = this.parseToolArguments(call, part)
    if (!parsed.ok) return { toolCallId: call.id, content: parsed.error }
    const validation = this.validateToolArguments(call, parsed.args, part)
    if (!validation.ok) return { toolCallId: call.id, content: validation.error }

    const legacyStep = this.createLegacyStep(call, part)
    this.options.context.stepId = legacyStep.id
    this.options.context.partId = part.id

    this.parts.startToolCallPart(part.id, {
      rawArguments: call.function.arguments,
      legacyStepId: legacyStep.id
    })
    eventBus.publish('agent:tool-call', {
      topicId: this.options.run.topicId,
      taskId: this.options.run.taskId,
      toolName: call.function.name,
      args: validation.args
    })

    try {
      const context = this.contextFactory.create(
        part.id,
        legacyStep.id,
        call.function.name,
        this.currentTurnId
      )
      if (this.options.context.abort?.aborted) {
        throw new Error('Run cancelled')
      }
      const result = await this.options.toolRegistry.execute(
        call.function.name,
        validation.args,
        context
      )
      const output = result.output
      const metadata = result.metadata ?? {}

      taskStepDB.updateStep(legacyStep.id, {
        status: 'completed',
        rawOutput: output,
        endedAt: Date.now(),
        metadata
      })
      this.parts.completeToolCallPart(part.id, { output, metadata })
      eventBus.publish('agent:tool-result', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        toolName: call.function.name,
        output: output.slice(0, 500),
        error: false
      })

      if (metadata.usage) {
        this.options.provider.mergeChildUsage(metadata.usage as SessionUsage)
      }

      const verificationUpdate = this.trackVerification(call, result, metadata)
      if (
        verificationUpdate.createdIds.length > 0 ||
        verificationUpdate.clearedIds.length > 0 ||
        verificationUpdate.ignoredIds.length > 0
      ) {
        Object.assign(metadata, {
          verificationIdsCreated: verificationUpdate.createdIds,
          verificationIdsCleared: verificationUpdate.clearedIds,
          verificationIdsIgnored: verificationUpdate.ignoredIds
        })
        this.parts.updateToolCallPart(part.id, { metadata })
        taskStepDB.updateStep(legacyStep.id, { metadata })
      }

      return {
        toolCallId: call.id,
        content: output,
        metadata: { ...metadata, observation: output }
      }
    } catch (error) {
      const message = `Error: ${getErrorMessage(error)}`
      taskStepDB.updateStep(legacyStep.id, {
        status: 'failed',
        rawOutput: message,
        endedAt: Date.now()
      })
      this.parts.failToolCallPart(part.id, { error: message })
      eventBus.publish('agent:tool-result', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        toolName: call.function.name,
        output: message.slice(0, 500),
        error: true
      })
      return { toolCallId: call.id, content: message, metadata: { observation: message } }
    }
  }

  private repairToolCallName(call: ChatCompletionMessageFunctionToolCall): void {
    const name = call.function.name
    const lower = name.toLowerCase()
    if (name === lower) return
    const available = this.options.toolRegistry
      .getFilteredDefinitions(this.options.config.name)
      .some((tool) => tool.function.name === lower)
    if (available && this.options.permissionEngine.isToolAllowed(lower)) {
      call.function.name = lower
    }
  }

  private normalizeVisibleToolArguments(call: ChatCompletionMessageFunctionToolCall): void {
    if (call.function.name !== 'websearch') return

    try {
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      if (typeof args.query !== 'string') return

      const normalized = normalizeCurrentNewsQuery(args.query, getSearchTimeContext())
      if (normalized.removedDates.length === 0) return

      call.function.arguments = JSON.stringify({
        ...args,
        query: normalized.displayQuery
      })
    } catch {
      // Leave malformed arguments to the normal parser/validator path.
    }
  }

  private ensureToolPart(call: ChatCompletionMessageFunctionToolCall): AgentPart {
    const existing = agentRunStore
      .getParts(this.options.run.id)
      .find((part) => part.toolCallId === call.id)
    if (existing) return existing
    return this.parts.createToolCallPart({
      runId: this.options.run.id,
      toolName: call.function.name,
      toolCallId: call.id,
      input: call.function.arguments
    })
  }

  private parseToolArguments(
    call: ChatCompletionMessageFunctionToolCall,
    part: AgentPart
  ): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
    try {
      return { ok: true, args: JSON.parse(call.function.arguments || '{}') }
    } catch (error) {
      const message = `Error: Tool "${call.function.name}" received invalid JSON arguments: ${getErrorMessage(error)}`
      this.parts.failToolCallPart(part.id, { error: message })
      return { ok: false, error: message }
    }
  }

  private validateToolArguments(
    call: ChatCompletionMessageFunctionToolCall,
    args: Record<string, unknown>,
    part: AgentPart
  ): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
    const validation = this.options.toolRegistry.validate(call.function.name, args)
    if (validation.ok) return validation

    const message = JSON.stringify(validation.error, null, 2)
    this.parts.failToolCallPart(part.id, {
      error: message,
      metadata: { schemaValidationError: validation.error }
    })
    return { ok: false, error: message }
  }

  private createLegacyStep(call: ChatCompletionMessageFunctionToolCall, part: AgentPart): TaskStep {
    return taskStepDB.createStep({
      taskId: this.options.run.taskId,
      type: 'command',
      status: 'running',
      title: `Calling tool ${call.function.name}`,
      content: call.function.arguments,
      metadata: { runId: this.options.run.id, partId: part.id },
      startedAt: Date.now()
    })
  }

  private async formatObservation(
    call: ChatCompletionMessageFunctionToolCall,
    result: ToolResult
  ): Promise<string> {
    const verificationNote = this.formatVerificationNote(result.metadata)
    if (call.function.name !== 'execute_command') {
      return [result.content, verificationNote].filter(Boolean).join('\n')
    }

    try {
      const parsed = JSON.parse(result.content)
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      const hostId = typeof args.hostId === 'string' ? args.hostId : 'unknown'
      const terminalName =
        typeof args.terminalName === 'string' ? args.terminalName : 'detached-command'

      if (parsed.content !== undefined && parsed.exitCode !== undefined) {
        const observation = fromCommandResult(parsed, hostId, terminalName)
        return [formatObservation(observation), verificationNote].filter(Boolean).join('\n')
      }

      if (parsed.content && parsed.content.length > 2000) {
        const distilled = await MemoryManager.distillObservation(
          typeof args.command === 'string' ? args.command : '',
          parsed.content || '',
          parsed.exitCode
        )
        return [distilled, verificationNote].filter(Boolean).join('\n')
      }
    } catch {
      return [result.content, verificationNote].filter(Boolean).join('\n')
    }

    return [result.content, verificationNote].filter(Boolean).join('\n')
  }

  private trackVerification(
    call: ChatCompletionMessageFunctionToolCall,
    result: { output: string; metadata?: Record<string, unknown> },
    metadata: Record<string, unknown>
  ): VerificationTrackingUpdate {
    const update: VerificationTrackingUpdate = {
      createdIds: [],
      clearedIds: [],
      ignoredIds: []
    }
    const args = this.safeParseArgs(call.function.arguments)
    const hostId = this.stringValue(metadata.hostId) ?? this.stringValue(args.hostId)
    if (!hostId) return update

    const riskCategory = this.riskCategoryValue(metadata.riskCategory)
    const exitCode = this.numberValue(metadata.exitCode) ?? this.parseExitCode(result.output)
    const command = this.stringValue(metadata.command) ?? this.stringValue(args.command) ?? ''

    if (call.function.name !== 'execute_command') {
      if (metadata.requiresVerification === true && (exitCode === undefined || exitCode === 0)) {
        const id = this.createPendingVerification({
          hostId,
          toolName: call.function.name,
          command: command || call.function.name,
          riskCategory: riskCategory ?? 'write',
          metadata
        })
        update.createdIds.push(id)
      }
      return update
    }

    if (riskCategory === 'read' && exitCode === 0) {
      const requestedIds = this.stringArrayValue(args.verificationIds)
      for (const id of requestedIds) {
        const pending = this.pendingVerifications.get(id)
        if (pending && pending.hostId === hostId) {
          this.pendingVerifications.delete(id)
          update.clearedIds.push(id)
        } else {
          update.ignoredIds.push(id)
        }
      }
      return update
    }

    if (metadata.requiresVerification === true && exitCode === 0) {
      const id = this.createPendingVerification({
        hostId,
        toolName: call.function.name,
        command,
        riskCategory: riskCategory ?? 'write',
        metadata
      })
      update.createdIds.push(id)
    }

    return update
  }

  private createPendingVerification(input: {
    hostId: string
    toolName: string
    command: string
    riskCategory: PolicyRiskCategory
    metadata?: Record<string, unknown>
  }): string {
    const id = `ver_${uuidv4().slice(0, 8)}`
    this.pendingVerifications.set(id, {
      id,
      hostId: input.hostId,
      toolName: input.toolName,
      command: input.command,
      riskCategory: input.riskCategory,
      metadata: input.metadata,
      createdAt: Date.now()
    })
    return id
  }

  private formatVerificationNote(metadata: Record<string, unknown> | undefined): string {
    const createdIds = this.stringArrayValue(metadata?.verificationIdsCreated)
    const clearedIds = this.stringArrayValue(metadata?.verificationIdsCleared)
    const ignoredIds = this.stringArrayValue(metadata?.verificationIdsIgnored)
    const lines: string[] = []

    if (createdIds.length > 0) {
      lines.push(
        `[Runtime verification] 该操作需要后续只读验证。验证时请在 execute_command 参数 verificationIds 中带上：${createdIds.join(', ')}`
      )
    }
    if (clearedIds.length > 0) {
      lines.push(`[Runtime verification] 已确认并清除验证项：${clearedIds.join(', ')}`)
    }
    if (ignoredIds.length > 0) {
      lines.push(
        `[Runtime verification] 以下 verificationIds 未匹配当前主机或不存在，未清除：${ignoredIds.join(', ')}`
      )
    }

    return lines.join('\n')
  }

  private stringArrayValue(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  private numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
  }

  private riskCategoryValue(value: unknown): PolicyRiskCategory | undefined {
    if (
      value === 'read' ||
      value === 'write' ||
      value === 'network' ||
      value === 'package' ||
      value === 'privilege' ||
      value === 'destructive'
    ) {
      return value
    }
    return undefined
  }

  private parseExitCode(output: string): number | undefined {
    try {
      const parsed = JSON.parse(output) as { exitCode?: unknown }
      return typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined
    } catch {
      return undefined
    }
  }

  private makeObservation(
    call: ChatCompletionMessageFunctionToolCall,
    args: Record<string, unknown>,
    content: string
  ): ToolCallExecutionObservation {
    return {
      role: 'tool',
      tool_call_id: call.id,
      content,
      toolName: call.function.name,
      args,
      call: {
        id: call.id,
        type: call.type,
        function: {
          name: call.function.name,
          arguments: call.function.arguments
        }
      }
    }
  }

  private isToolCallAttempt(value: unknown): value is ToolCallAttempt {
    return !!value && typeof value === 'object' && 'call' in value && 'args' in value
  }

  private asToolCall(
    value: ChatCompletionMessageFunctionToolCall | ToolCallAttempt
  ): ChatCompletionMessageFunctionToolCall {
    return this.isToolCallAttempt(value) ? value.call : value
  }

  private annotateAttemptDiagnostics(
    value: ChatCompletionMessageFunctionToolCall | ToolCallAttempt,
    part: AgentPart
  ): void {
    if (!this.isToolCallAttempt(value)) return
    if (value.count <= 1) return
    this.parts.updateToolCallPart(part.id, {
      metadata: {
        repeatedToolCallDiagnostic: true,
        repeatedToolCallSignature: value.signature,
        repeatedToolCallCount: value.count,
        repeatedToolCallOutputRepeated: value.entry.lastOutputRepeated === true,
        repeatedToolCallLastStatus: value.entry.lastStatus
      }
    })
  }
}

interface PendingVerification {
  id: string
  hostId: string
  toolName: string
  command: string
  riskCategory: PolicyRiskCategory
  metadata?: Record<string, unknown>
  createdAt: number
}

interface VerificationTrackingUpdate {
  createdIds: string[]
  clearedIds: string[]
  ignoredIds: string[]
}
