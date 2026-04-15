import { z } from 'zod'
import type { ToolDefinition } from './types'
import type { Message } from '../../shared/types'

// ─── Tool namespace ─────────────────────────────────────────────

export namespace Tool {
  /** Context available to all tool executions */
  export interface Context {
    topicId: string
    taskId: string
    stepId?: string
    webContents: import('electron').WebContents
    agentService: import('../AgentRunner').IAgentService
    ensureSession: (hostId: string, hostAlias: string, name?: string) => Promise<string>
    requestAuthorization: (
      command: string,
      riskLevel: 'low' | 'medium' | 'high' | 'critical',
      reason: string
    ) => Promise<{ approved: boolean; alwaysAllow: boolean }>
    notifyStep: (message: Message) => void
    metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
  }

  export interface Metadata {
    [key: string]: unknown
  }

  export interface ExecuteResult<M extends Metadata = Metadata> {
    output: string
    title?: string
    metadata?: M
  }

  export interface Init<P extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    description: string
    parameters: P
    execute(args: z.infer<P>, ctx: Context): Promise<ExecuteResult<M>>
    formatValidationError?: (error: z.ZodError) => string
  }

  export interface Info<P extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    description: string
    parameters: P
    definition: ToolDefinition
    execute(args: Record<string, unknown>, ctx: Context): Promise<ExecuteResult<M>>
  }
}

// ─── zodToJsonSchema ────────────────────────────────────────────

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = schema._def as { type?: string; [key: string]: unknown }

  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value)
        // A field is required unless it's wrapped in optional or has a default
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
      // Preserve description if the object itself was described
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

    default:
      // Fallback: return a generic object schema
      return { type: 'object' }
  }
}

/** Check whether a Zod schema is optional or has a default (i.e. not required). */
function isOptionalish(schema: z.ZodType): boolean {
  const def = schema._def as { type?: string; innerType?: z.ZodType }
  return def.type === 'optional' || def.type === 'default'
}

/** Attach `.description` from a described Zod schema to the JSON Schema output. */
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

// ─── Default validation error formatter ─────────────────────────

function defaultFormatValidationError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `  - ${path}: ${issue.message}`
  })
  return (
    `Parameter validation failed:\n${lines.join('\n')}\n\n` +
    'Please correct the parameters and try again. Ensure all required fields are provided with the correct types.'
  )
}

// ─── define() ───────────────────────────────────────────────────

export function define<P extends z.ZodType, M extends Tool.Metadata>(
  id: string,
  init: Tool.Init<P, M>
): Tool.Info<P, M> {
  const parametersSchema = zodToJsonSchema(init.parameters)

  const definition: ToolDefinition = {
    type: 'function',
    function: {
      name: id,
      description: init.description,
      parameters: parametersSchema
    }
  }

  const formatError = init.formatValidationError ?? defaultFormatValidationError

  async function execute(
    args: Record<string, unknown>,
    ctx: Tool.Context
  ): Promise<Tool.ExecuteResult<M>> {
    const result = init.parameters.safeParse(args)

    if (!result.success) {
      const errorMessage = formatError(result.error)
      return {
        output: errorMessage,
        metadata: { validationError: true } as unknown as M
      }
    }

    return init.execute(result.data, ctx)
  }

  return {
    id,
    description: init.description,
    parameters: init.parameters,
    definition,
    execute
  }
}
