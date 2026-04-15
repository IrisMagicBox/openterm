import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { define, Tool } from '../tool-factory'

// ─── Stub context ───────────────────────────────────────────────

function makeCtx(): Tool.Context {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    stepId: 'step-1',
    webContents: {} as never,
    agentService: {} as never,
    ensureSession: vi.fn().mockResolvedValue('session-1'),
    requestAuthorization: vi.fn().mockResolvedValue({ approved: true, alwaysAllow: false }),
    notifyStep: vi.fn(),
    metadata: vi.fn()
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('define()', () => {
  it('creates a Tool.Info with correct id and definition', () => {
    const tool = define('my_tool', {
      description: 'A test tool',
      parameters: z.object({ name: z.string() }),
      execute: async (args) => ({ output: `Hello ${args.name}` })
    })

    expect(tool.id).toBe('my_tool')
    expect(tool.description).toBe('A test tool')
    expect(tool.definition.type).toBe('function')
    expect(tool.definition.function.name).toBe('my_tool')
    expect(tool.definition.function.description).toBe('A test tool')
    expect(tool.definition.function.parameters).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    })
  })

  it('validates parameters with Zod and returns error on invalid input', async () => {
    const tool = define('validate_tool', {
      description: 'Validates input',
      parameters: z.object({
        count: z.number(),
        label: z.string()
      }),
      execute: async (args) => ({ output: `count=${args.count} label=${args.label}` })
    })

    const result = await tool.execute({ count: 'not_a_number', label: 123 }, makeCtx())

    // Should NOT throw — returns a self-correcting error message
    expect(result.output.toLowerCase()).toContain('validation')
    expect(result.metadata?.validationError).toBe(true)
  })

  it('passes validated args to execute on valid input', async () => {
    const tool = define('echo_tool', {
      description: 'Echoes input',
      parameters: z.object({ msg: z.string() }),
      execute: async (args) => ({ output: args.msg })
    })

    const result = await tool.execute({ msg: 'hello world' }, makeCtx())
    expect(result.output).toBe('hello world')
    expect(result.metadata?.validationError).toBeUndefined()
  })

  it('supports custom formatValidationError', async () => {
    const tool = define('custom_err', {
      description: 'Custom error format',
      parameters: z.object({ x: z.number() }),
      execute: async (args) => ({ output: `x=${args.x}` }),
      formatValidationError: (error) =>
        `CUSTOM_ERROR: ${error.issues.map((i) => i.message).join('; ')}`
    })

    const result = await tool.execute({ x: 'bad' }, makeCtx())
    expect(result.output).toContain('CUSTOM_ERROR')
    expect(result.metadata?.validationError).toBe(true)
  })

  it('generates correct JSON Schema with descriptions from z.string().describe()', () => {
    const tool = define('desc_tool', {
      description: 'Has descriptions',
      parameters: z.object({
        name: z.string().describe('The user name'),
        age: z.number().describe('The user age in years')
      }),
      execute: async () => ({ output: 'ok' })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>
    const props = params.properties as Record<string, Record<string, unknown>>

    expect(props.name.type).toBe('string')
    expect(props.name.description).toBe('The user name')
    expect(props.age.type).toBe('number')
    expect(props.age.description).toBe('The user age in years')
    expect(params.required).toEqual(['name', 'age'])
  })

  it('handles z.optional fields correctly (not in required array)', () => {
    const tool = define('opt_tool', {
      description: 'Has optional fields',
      parameters: z.object({
        required_field: z.string(),
        optional_field: z.optional(z.string())
      }),
      execute: async (args) => ({
        output: args.optional_field ?? 'default'
      })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>

    expect(params.required).toEqual(['required_field'])
    expect((params.properties as Record<string, unknown>).optional_field).toBeDefined()
  })

  it('handles z.enum with enum values in JSON Schema', () => {
    const tool = define('enum_tool', {
      description: 'Has enum',
      parameters: z.object({
        color: z.enum(['red', 'green', 'blue'])
      }),
      execute: async (args) => ({ output: args.color })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>
    const colorProp = (params.properties as Record<string, Record<string, unknown>>).color

    expect(colorProp.type).toBe('string')
    expect(colorProp.enum).toEqual(['red', 'green', 'blue'])
  })

  it('handles z.array with items schema', () => {
    const tool = define('array_tool', {
      description: 'Has array',
      parameters: z.object({
        items: z.array(z.string())
      }),
      execute: async (args) => ({ output: args.items.join(',') })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>
    const itemsProp = (params.properties as Record<string, Record<string, unknown>>).items

    expect(itemsProp.type).toBe('array')
    expect(itemsProp.items).toEqual({ type: 'string' })
  })

  it('handles z.boolean', () => {
    const tool = define('bool_tool', {
      description: 'Has boolean',
      parameters: z.object({ active: z.boolean() }),
      execute: async (args) => ({ output: String(args.active) })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>
    const activeProp = (params.properties as Record<string, Record<string, unknown>>).active

    expect(activeProp.type).toBe('boolean')
  })

  it('handles z.default fields (not required)', () => {
    const tool = define('default_tool', {
      description: 'Has defaults',
      parameters: z.object({
        name: z.string(),
        greeting: z.string().default('hello')
      }),
      execute: async (args) => ({ output: `${args.greeting} ${args.name}` })
    })

    const params = tool.definition.function.parameters as Record<string, unknown>

    // Fields with defaults should NOT be required
    expect(params.required).toEqual(['name'])
    // The property schema should still reflect the inner type
    const greetingProp = (params.properties as Record<string, Record<string, unknown>>).greeting
    expect(greetingProp.type).toBe('string')
  })

  it('returns self-correcting error message with specific validation failures', async () => {
    const tool = define('strict_tool', {
      description: 'Strict validation',
      parameters: z.object({
        email: z.string(),
        age: z.number()
      }),
      execute: async (args) => ({ output: `${args.email} ${args.age}` })
    })

    const result = await tool.execute({ email: 123, age: 'not_a_number' }, makeCtx())

    // The error should mention the specific field issues
    expect(result.output).toContain('email')
    expect(result.output).toContain('age')
    expect(result.output).toContain('correct the parameters')
  })

  it('handles ExecuteResult with title and custom metadata', async () => {
    const tool = define('meta_tool', {
      description: 'Returns metadata',
      parameters: z.object({ x: z.number() }),
      execute: async (args) => ({
        output: `result: ${args.x}`,
        title: 'Computation',
        metadata: { computationTime: 42 }
      })
    })

    const result = await tool.execute({ x: 5 }, makeCtx())
    expect(result.output).toBe('result: 5')
    expect(result.title).toBe('Computation')
    expect(result.metadata?.computationTime).toBe(42)
  })
})
