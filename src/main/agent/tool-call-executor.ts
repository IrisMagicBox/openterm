import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { v4 as uuidv4 } from 'uuid'
import { getErrorMessage } from '../../shared/errors'
import type { AgentPart, PolicyRiskCategory, TaskStep, ToolResult } from '../../shared/types'
import { taskStepDB } from '../db'
import { MemoryManager } from '../MemoryManager'
import { executeGrouped } from './session-scheduler'
import { DoomLoopDetector, DOOM_LOOP_THRESHOLD } from './doom-loop'
import { fromCommandResult, formatObservation } from '../tools/observation'
import { ToolContextFactory } from '../tools/tool-context-factory'
import { getSearchTimeContext, normalizeCurrentNewsQuery } from '../tools/websearch'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import type { AgentProcessorOptions } from './agent-processor-types'
import type { SessionUsage } from './provider-adapter'
import { AgentPartWriter } from './agent-part-writer'
import type { PendingVerificationCheckpoint } from './agent-checkpoint'

export class ToolCallExecutor {
  private readonly doomLoop = new DoomLoopDetector()
  private readonly legacyEvents: LegacyAgentEventAdapter
  private readonly contextFactory: ToolContextFactory
  private readonly parts = new AgentPartWriter()
  private readonly pendingVerifications = new Map<string, PendingVerification>()
  private lastWaitActivityKey: string | null = null
  private repeatedWaitActivityCount = 0

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
    this.doomLoop.reset()
    this.pendingVerifications.clear()
    this.lastWaitActivityKey = null
    this.repeatedWaitActivityCount = 0
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
    toolCalls: ChatCompletionMessageFunctionToolCall[]
  ): Promise<ChatCompletionMessageParam[]> {
    const safeCalls: ChatCompletionMessageFunctionToolCall[] = []
    const observations: ChatCompletionMessageParam[] = []

    for (const call of toolCalls) {
      this.repairToolCallName(call)
      this.normalizeVisibleToolArguments(call)
      const part = this.ensureToolPart(call)
      const parsed = this.parseToolArguments(call, part)
      if (!parsed.ok) {
        observations.push({ role: 'tool', tool_call_id: call.id, content: parsed.error })
        continue
      }

      if (call.function.name === 'invalid_tool') {
        const error =
          typeof parsed.args.error === 'string'
            ? `Error: ${parsed.args.error}`
            : `Error: Unknown tool "${String(parsed.args.tool ?? 'unknown')}".`
        this.parts.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      if (!this.options.permissionEngine.isToolAllowed(call.function.name)) {
        const error = `Error: Tool "${call.function.name}" is not allowed for agent "${this.options.config.name}".`
        this.parts.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      const validation = this.validateToolArguments(call, parsed.args, part)
      if (!validation.ok) {
        observations.push({ role: 'tool', tool_call_id: call.id, content: validation.error })
        continue
      }

      const repeatedWaitObservation = this.checkRepeatedWaitActivity(call, validation.args, part)
      if (repeatedWaitObservation) {
        observations.push({
          role: 'tool',
          tool_call_id: call.id,
          content: repeatedWaitObservation
        })
        continue
      }

      if (this.doomLoop.check(call.function.name, validation.args)) {
        const error = `Doom loop detected: the tool '${call.function.name}' has been called with identical arguments ${DOOM_LOOP_THRESHOLD} times consecutively. Try a different approach or arguments.`
        this.parts.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        eventBus.publish('agent:doom-loop', {
          topicId: this.options.run.topicId,
          taskId: this.options.run.taskId,
          toolName: call.function.name,
          callCount: DOOM_LOOP_THRESHOLD
        })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      safeCalls.push(call)
    }

    if (safeCalls.length === 0) return observations

    this.legacyEvents.status('executing')
    const results = await executeGrouped(safeCalls, (call) => this.executeTool(call))
    for (const call of safeCalls) {
      const result = results.get(call.id)
      if (!result) continue
      observations.push({
        role: 'tool',
        tool_call_id: call.id,
        content: await this.formatObservation(call, result)
      })
    }

    return observations
  }

  private async executeTool(call: ChatCompletionMessageFunctionToolCall): Promise<ToolResult> {
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

    this.parts.updatePart(part.id, {
      status: 'running',
      input: call.function.arguments,
      startedAt: Date.now(),
      metadata: { legacyStepId: legacyStep.id }
    })
    eventBus.publish('agent:tool-call', {
      topicId: this.options.run.topicId,
      taskId: this.options.run.taskId,
      toolName: call.function.name,
      args: validation.args
    })

    try {
      const context = this.contextFactory.create(part.id, legacyStep.id, call.function.name)
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
      this.parts.updatePart(part.id, {
        status: 'completed',
        output,
        endedAt: Date.now(),
        metadata
      })
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
        this.parts.updatePart(part.id, { metadata })
        taskStepDB.updateStep(legacyStep.id, { metadata })
      }

      return { toolCallId: call.id, content: output, metadata }
    } catch (error) {
      const message = `Error: ${getErrorMessage(error)}`
      taskStepDB.updateStep(legacyStep.id, {
        status: 'failed',
        rawOutput: message,
        endedAt: Date.now()
      })
      this.parts.updatePart(part.id, {
        status: 'error',
        error: message,
        endedAt: Date.now()
      })
      eventBus.publish('agent:tool-result', {
        topicId: this.options.run.topicId,
        taskId: this.options.run.taskId,
        toolName: call.function.name,
        output: message.slice(0, 500),
        error: true
      })
      return { toolCallId: call.id, content: message }
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

  private checkRepeatedWaitActivity(
    call: ChatCompletionMessageFunctionToolCall,
    args: Record<string, unknown>,
    part: AgentPart
  ): string | undefined {
    if (call.function.name === 'send_terminal_keys' || call.function.name === 'manage_terminal') {
      this.lastWaitActivityKey = null
      this.repeatedWaitActivityCount = 0
      return undefined
    }

    if (call.function.name !== 'wait_terminal_activity') {
      this.lastWaitActivityKey = null
      this.repeatedWaitActivityCount = 0
      return undefined
    }

    const key = [
      this.stringValue(args.sessionId) ?? 'unknown-session',
      this.stringValue(args.stopText) ?? '',
      this.stringValue(args.stopRegex) ?? ''
    ].join('|')

    if (this.lastWaitActivityKey === key) {
      this.repeatedWaitActivityCount += 1
    } else {
      this.lastWaitActivityKey = key
      this.repeatedWaitActivityCount = 1
    }

    if (this.repeatedWaitActivityCount < 3) return undefined

    const message = [
      '[Runtime observation] 已连续多次等待同一个终端活动，但没有新的输入动作。',
      '不要继续盲目调用 wait_terminal_activity。请基于最近一次终端屏幕和变化摘要总结当前结果；如果仍无法确认完成，请说明仍在运行/等待用户输入/需要用户接管。'
    ].join('\n')
    this.parts.updatePart(part.id, {
      status: 'blocked',
      output: message,
      endedAt: Date.now(),
      metadata: {
        repeatedWaitActivity: true,
        waitKey: key,
        count: this.repeatedWaitActivityCount
      }
    })
    return message
  }

  private ensureToolPart(call: ChatCompletionMessageFunctionToolCall): AgentPart {
    const existing = agentRunStore
      .getParts(this.options.run.id)
      .find((part) => part.toolCallId === call.id)
    if (existing) return existing
    return this.parts.createToolPart({
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
      this.parts.updatePart(part.id, { status: 'error', error: message, endedAt: Date.now() })
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
    this.parts.updatePart(part.id, {
      status: 'error',
      error: message,
      endedAt: Date.now(),
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
