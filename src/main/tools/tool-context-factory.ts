import type { Tool } from './tool-factory'
import type { AgentContext } from '../AgentRunner'
import { agentRunStore } from '../agent/agent-run-store'
import type { AgentPermissionEngine } from '../agent/agent-permission-engine'
import type { AgentConfig } from '../agent/agent-config'

export interface ToolContextFactoryOptions {
  context: AgentContext
  runId: string
  config: AgentConfig
  permissionEngine: AgentPermissionEngine
}

export class ToolContextFactory {
  constructor(private readonly options: ToolContextFactoryOptions) {}

  create(partId: string, stepId: string): Tool.Context {
    const { context, runId, config, permissionEngine } = this.options
    return {
      ...context,
      runId,
      partId,
      stepId,
      agent: config.name,
      abort: context.abort ?? new AbortController().signal,
      messages: [],
      requestAuthorization: async (command, riskLevel, reason) =>
        permissionEngine.ask({
          permission: 'command',
          pattern: command,
          riskLevel,
          reason
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
        agentRunStore.appendMetadata(partId, metadata)
      },
      updatePart: (updates) => agentRunStore.updatePart(partId, updates),
      createChildPart: (input) =>
        agentRunStore.createPart({
          runId,
          parentPartId: partId,
          ...input
        }),
      terminal: {
        ensureSession: context.ensureSession
      },
      permission: {
        ask: (request) => permissionEngine.ask(request)
      },
      parts: {
        updateMetadata: (metadata) => agentRunStore.appendMetadata(partId, metadata),
        update: (updates) => agentRunStore.updatePart(partId, updates),
        createChild: (input) =>
          agentRunStore.createPart({
            runId,
            parentPartId: partId,
            ...input
          })
      },
      events: {
        notifyStep: context.notifyStep
      }
    }
  }
}
