/* eslint-disable @typescript-eslint/no-namespace */
import { z } from 'zod'
import type { Message } from '../../shared/types'
import type { TerminalSessionRole } from '../../shared/types'
import { truncateOutput as truncateToDisk } from './truncation'

export namespace Tool {
  export interface InitContext {
    agent?: string
  }

  export interface PermissionRequest {
    permission: string
    pattern: string
    always?: boolean
    metadata?: Record<string, unknown>
  }

  export interface Context {
    topicId: string
    taskId: string
    stepId?: string
    runId?: string
    partId?: string
    parentRunId?: string
    parentPartId?: string
    webContents: import('electron').WebContents
    agentService: import('../AgentRunner').IAgentService
    ensureSession: (
      hostId: string,
      hostAlias: string,
      name?: string,
      options?: { role?: TerminalSessionRole }
    ) => Promise<string>
    requestAuthorization: (
      command: string,
      riskLevel: 'low' | 'medium' | 'high' | 'critical',
      reason: string,
      metadata?: Record<string, unknown>
    ) => Promise<{ approved: boolean; alwaysAllow: boolean }>
    notifyStep: (message: Message) => void
    metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
    ask: (request: PermissionRequest) => Promise<void>
    abort: AbortSignal
    messages: Array<{ role: string; content: string }>
    agent: string
    updatePartMetadata?: (metadata: Record<string, unknown>) => void
    updatePart?: (
      updates: Partial<Omit<import('../../shared/types').AgentPart, 'id' | 'runId' | 'createdAt'>>
    ) => import('../../shared/types').AgentPart | undefined
    createChildPart?: (input: {
      type: import('../../shared/types').AgentPartType
      status: import('../../shared/types').AgentPartStatus
      role?: 'user' | 'assistant' | 'system' | 'tool'
      toolName?: string
      toolCallId?: string
      hostId?: string
      sessionId?: string
      input?: string
      output?: string
      error?: string
      metadata?: Record<string, unknown>
      startedAt?: number
      endedAt?: number
    }) => import('../../shared/types').AgentPart
    terminal?: {
      ensureSession: Context['ensureSession']
    }
    permission?: {
      ask: (request: import('../agent/agent-permission-engine').AgentPermissionRequest) => Promise<{
        approved: boolean
        alwaysAllow: boolean
      }>
    }
    parts?: {
      updateMetadata: (
        metadata: Record<string, unknown>
      ) => import('../../shared/types').AgentPart | undefined
      update: NonNullable<Context['updatePart']>
      createChild: NonNullable<Context['createChildPart']>
    }
    events?: {
      notifyStep: Context['notifyStep']
    }
  }

  export interface Metadata {
    [key: string]: unknown
  }

  export interface ExecuteResult<M extends Metadata = Metadata> {
    output: string
    title?: string
    metadata?: M
  }

  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context
      ): Promise<{
        title?: string
        metadata?: M
        output: string
      }>
      formatValidationError?: (error: z.ZodError) => string
    }>
  }
}

export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = schema._def as { type?: string; [key: string]: unknown }

  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value)
        if (!isOptionalish(value)) {
          required.push(key)
        }
      }

      const result: Record<string, unknown> = {
        type: 'object',
        properties
      }
      if (required.length > 0) {
        result.required = required
      }
      if ((schema as { description?: string }).description) {
        result.description = (schema as { description: string }).description
      }
      return result
    }

    case 'string':
      return withStringDescription(schema, { type: 'string' })

    case 'number':
      return withStringDescription(schema, { type: 'number' })

    case 'boolean':
      return withStringDescription(schema, { type: 'boolean' })

    case 'array': {
      const element = def.element as z.ZodType
      return withStringDescription(schema, {
        type: 'array',
        items: zodToJsonSchema(element)
      })
    }

    case 'enum': {
      const entries = def.entries as Record<string, string>
      return withStringDescription(schema, {
        type: 'string',
        enum: Object.values(entries)
      })
    }

    case 'optional': {
      const innerType = def.innerType as z.ZodType
      return zodToJsonSchema(innerType)
    }

    case 'default': {
      const innerType = def.innerType as z.ZodType
      return zodToJsonSchema(innerType)
    }

    case 'union': {
      const options = def.options as z.ZodType[]
      const anyOf = options.map((opt) => zodToJsonSchema(opt))
      return withStringDescription(schema, { anyOf })
    }

    case 'record': {
      const valueType = def.valueType as z.ZodType | undefined
      if (valueType) {
        return withStringDescription(schema, {
          type: 'object',
          additionalProperties: zodToJsonSchema(valueType)
        })
      }
      return { type: 'object', additionalProperties: true }
    }

    case 'tuple': {
      const items = def.items as z.ZodType[]
      const prefixItems = items.map((item) => zodToJsonSchema(item))
      return withStringDescription(schema, {
        type: 'array',
        prefixItems,
        minItems: items.length,
        maxItems: items.length
      })
    }

    default:
      return { type: 'object' }
  }
}

function isOptionalish(schema: z.ZodType): boolean {
  const def = schema._def as { type?: string; innerType?: z.ZodType }
  return def.type === 'optional' || def.type === 'default'
}

function withStringDescription(
  schema: z.ZodType,
  jsonSchema: Record<string, unknown>
): Record<string, unknown> {
  const desc = (schema as { description?: string }).description
  if (desc) {
    jsonSchema.description = desc
  }
  return jsonSchema
}

// ─── define() ───────────────────────────────────────────────────

export function define<Parameters extends z.ZodType, Result extends Tool.Metadata>(
  id: string,
  init:
    | Tool.Info<Parameters, Result>['init']
    | Awaited<ReturnType<Tool.Info<Parameters, Result>['init']>>
): Tool.Info<Parameters, Result> {
  return {
    id,
    init: async (initCtx) => {
      const toolInfo = init instanceof Function ? await init(initCtx) : init
      const execute = toolInfo.execute

      toolInfo.execute = async (rawArgs, ctx) => {
        let parsedArgs: z.infer<Parameters>
        try {
          parsedArgs = toolInfo.parameters.parse(rawArgs)
        } catch (error) {
          if (error instanceof z.ZodError && toolInfo.formatValidationError) {
            throw new Error(toolInfo.formatValidationError(error), { cause: error })
          }
          throw new Error(
            `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
            { cause: error }
          )
        }

        const result = await execute(parsedArgs, ctx)

        if (result.metadata?.truncated !== undefined) {
          return result as { title?: string; metadata?: Result; output: string }
        }

        const truncated = truncateToDisk(result.output, ctx.topicId, ctx.stepId)
        return {
          title: result.title,
          output: truncated.content,
          metadata: {
            ...(result.metadata || {}),
            truncated: truncated.truncated,
            ...(truncated.truncated && {
              originalLines: truncated.originalLines,
              originalBytes: truncated.originalBytes,
              outputPath: truncated.outputPath
            })
          } as unknown as Result
        }
      }

      return toolInfo
    }
  }
}
