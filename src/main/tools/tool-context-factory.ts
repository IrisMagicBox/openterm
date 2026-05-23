import type { Tool } from './tool-factory'
import type { AgentContext } from '../AgentRunner'
import type { AgentPermissionEngine } from '../agent/agent-permission-engine'
import type { AgentConfig } from '../agent/agent-config'
import { AgentPartProjection } from '../agent/agent-part-projection'

export interface ToolContextFactoryOptions {
  context: AgentContext
  runId: string
  config: AgentConfig
  permissionEngine: AgentPermissionEngine
}

export class ToolContextFactory {
  constructor(private readonly options: ToolContextFactoryOptions) {}

  private readonly parts = new AgentPartProjection()

  create(partId: string, stepId: string, toolName: string): Tool.Context {
    const { context, runId, config, permissionEngine } = this.options
    return {
      ...context,
      runId,
      partId,
      stepId,
      agent: config.name,
      abort: context.abort ?? new AbortController().signal,
      messages: [],
      requestAuthorization: async (command, riskLevel, reason, metadata) =>
        permissionEngine.ask({
          permission: toolName,
          pattern: command,
          riskLevel,
          reason,
          metadata: { ...metadata, toolName }
        }),
      ask: async (request) => {
        await permissionEngine.ask({
          permission: request.permission,
          pattern: request.pattern,
          reason: `Permission required: ${request.permission} for pattern "${request.pattern}"`,
          metadata: request.metadata
        })
      },
      updatePartMetadata: (metadata) => {
        this.parts.appendPartMetadata(partId, metadata)
      },
      updatePart: (updates) => this.parts.updatePart(partId, updates),
      createChildPart: (input) => this.parts.createChildPart(runId, partId, input),
      terminal: {
        ensureSession: context.ensureSession
      },
      permission: {
        ask: (request) => permissionEngine.ask(request)
      },
      parts: {
        updateMetadata: (metadata) => this.parts.appendPartMetadata(partId, metadata),
        update: (updates) => this.parts.updatePart(partId, updates),
        createChild: (input) => this.parts.createChildPart(runId, partId, input)
      },
      events: {
        notifyStep: context.notifyStep
      }
    }
  }
}
