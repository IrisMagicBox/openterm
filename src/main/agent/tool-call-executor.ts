import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions/completions'
import { getErrorMessage } from '../../shared/errors'
import type { AgentPart, PolicyRiskCategory, TaskStep, ToolResult } from '../../shared/types'
import { taskStepDB } from '../db'
import { MemoryManager } from '../MemoryManager'
import { executeGrouped } from './session-scheduler'
import { DoomLoopDetector, DOOM_LOOP_THRESHOLD } from './doom-loop'
import { fromCommandResult, formatObservation } from '../tools/observation'
import { ToolContextFactory } from '../tools/tool-context-factory'
import { agentRunStore } from './agent-run-store'
import { eventBus } from './event-bus'
import { LegacyAgentEventAdapter } from './legacy-agent-event-adapter'
import type { AgentProcessorOptions } from './agent-processor-types'
import type { SessionUsage } from './provider-adapter'

export class ToolCallExecutor {
  private readonly doomLoop = new DoomLoopDetector()
  private readonly legacyEvents: LegacyAgentEventAdapter
  private readonly contextFactory: ToolContextFactory
  private readonly pendingVerifications = new Map<string, PendingVerification>()

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

  getVerificationObservation(): string {
    const pending = Array.from(this.pendingVerifications.values())
    const lines = pending.map(
      (item) =>
        `- host=${item.hostId}, category=${item.riskCategory}, command=${item.command}`
    )
    return [
      '[Runtime observation] 你刚才执行了会修改系统状态的操作，但还没有提供只读验证证据。',
      '请继续使用 execute_command 执行只读验证命令，确认修改结果，再给出最终回答。',
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
      const part = this.ensureToolPart(call)
      const parsed = this.parseToolArguments(call, part)
      if (!parsed.ok) {
        observations.push({ role: 'tool', tool_call_id: call.id, content: parsed.error })
        continue
      }

      if (!this.options.permissionEngine.isToolAllowed(call.function.name)) {
        const error = `Error: Tool "${call.function.name}" is not allowed for agent "${this.options.config.name}".`
        agentRunStore.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
        observations.push({ role: 'tool', tool_call_id: call.id, content: error })
        continue
      }

      if (this.doomLoop.check(call.function.name, parsed.args)) {
        const error = `Doom loop detected: the tool '${call.function.name}' has been called with identical arguments ${DOOM_LOOP_THRESHOLD} times consecutively. Try a different approach or arguments.`
        agentRunStore.updatePart(part.id, { status: 'error', error, endedAt: Date.now() })
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
    const part = this.ensureToolPart(call)
    const parsed = this.parseToolArguments(call, part)
    if (!parsed.ok) return { toolCallId: call.id, content: parsed.error }

    const legacyStep = this.createLegacyStep(call, part)
    this.options.context.stepId = legacyStep.id
    this.options.context.partId = part.id

    agentRunStore.updatePart(part.id, {
      status: 'running',
      input: call.function.arguments,
      startedAt: Date.now(),
      metadata: { legacyStepId: legacyStep.id }
    })
    eventBus.publish('agent:tool-call', {
      topicId: this.options.run.topicId,
      taskId: this.options.run.taskId,
      toolName: call.function.name,
      args: parsed.args
    })

    try {
      const context = this.contextFactory.create(part.id, legacyStep.id)
      const result = await this.options.toolRegistry.execute(
        call.function.name,
        parsed.args,
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
      agentRunStore.updatePart(part.id, {
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

      this.trackVerification(call, result, metadata)

      return { toolCallId: call.id, content: output, metadata }
    } catch (error) {
      const message = `Error: ${getErrorMessage(error)}`
      taskStepDB.updateStep(legacyStep.id, {
        status: 'failed',
        rawOutput: message,
        endedAt: Date.now()
      })
      agentRunStore.updatePart(part.id, {
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

  private ensureToolPart(call: ChatCompletionMessageFunctionToolCall): AgentPart {
    const existing = agentRunStore
      .getParts(this.options.run.id)
      .find((part) => part.toolCallId === call.id)
    if (existing) return existing
    return agentRunStore.createPart({
      runId: this.options.run.id,
      type: 'tool',
      status: 'pending',
      role: 'tool',
      toolName: call.function.name,
      toolCallId: call.id,
      input: call.function.arguments,
      startedAt: Date.now()
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
      agentRunStore.updatePart(part.id, { status: 'error', error: message, endedAt: Date.now() })
      return { ok: false, error: message }
    }
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
    if (call.function.name !== 'execute_command') return result.content

    try {
      const parsed = JSON.parse(result.content)
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      const hostId = typeof args.hostId === 'string' ? args.hostId : 'unknown'
      const terminalName = typeof args.terminalName === 'string' ? args.terminalName : 'default'

      if (parsed.content !== undefined && parsed.exitCode !== undefined) {
        const observation = fromCommandResult(parsed, hostId, terminalName)
        return formatObservation(observation)
      }

      if (parsed.content && parsed.content.length > 2000) {
        return MemoryManager.distillObservation(
          typeof args.command === 'string' ? args.command : '',
          parsed.content || '',
          parsed.exitCode
        )
      }
    } catch {
      return result.content
    }

    return result.content
  }

  private trackVerification(
    call: ChatCompletionMessageFunctionToolCall,
    result: { output: string; metadata?: Record<string, unknown> },
    metadata: Record<string, unknown>
  ): void {
    const args = this.safeParseArgs(call.function.arguments)
    const hostId = this.stringValue(metadata.hostId) ?? this.stringValue(args.hostId)
    if (!hostId) return

    const riskCategory = this.riskCategoryValue(metadata.riskCategory)
    const exitCode = this.numberValue(metadata.exitCode) ?? this.parseExitCode(result.output)
    const command = this.stringValue(metadata.command) ?? this.stringValue(args.command) ?? ''

    if (call.function.name !== 'execute_command') {
      if (metadata.requiresVerification === true && (exitCode === undefined || exitCode === 0)) {
        this.pendingVerifications.set(hostId, {
          hostId,
          command: command || call.function.name,
          riskCategory: riskCategory ?? 'write',
          createdAt: Date.now()
        })
      }
      return
    }

    if (riskCategory === 'read' && exitCode === 0) {
      this.pendingVerifications.delete(hostId)
      return
    }

    if (metadata.requiresVerification === true && exitCode === 0) {
      this.pendingVerifications.set(hostId, {
        hostId,
        command,
        riskCategory: riskCategory ?? 'write',
        createdAt: Date.now()
      })
    }
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
  hostId: string
  command: string
  riskCategory: PolicyRiskCategory
  createdAt: number
}
