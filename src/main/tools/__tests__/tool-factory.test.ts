import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { define, Tool, ToolSchemaValidationError } from '../tool-factory'

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
    metadata: vi.fn(),
    ask: vi.fn().mockResolvedValue(undefined),
    abort: new AbortController().signal,
    messages: [],
    agent: 'test-agent'
  }
}

describe('define()', () => {
  it('creates a Tool.Info with correct id', () => {
    const tool = define('my_tool', {
      description: 'A test tool',
      parameters: z.object({ name: z.string() }),
      execute: async (args) => ({ output: `Hello ${args.name}`, title: 'Result', metadata: {} })
    })

    expect(tool.id).toBe('my_tool')
    expect(typeof tool.init).toBe('function')
  })

  it('returns correct definition after init', async () => {
    const tool = define('my_tool', {
      description: 'A test tool',
      parameters: z.object({ name: z.string() }),
      execute: async (args) => ({ output: `Hello ${args.name}`, title: 'Result', metadata: {} })
    })

    const initialized = await tool.init()
    expect(initialized.description).toBe('A test tool')
    expect(initialized.parameters).toBeDefined()
    expect(typeof initialized.execute).toBe('function')
  })

  it('validates parameters with Zod and throws on invalid input', async () => {
    const tool = define('validate_tool', {
      description: 'Validates input',
      parameters: z.object({
        count: z.number(),
        label: z.string()
      }),
      execute: async (args) => ({
        output: `count=${args.count} label=${args.label}`,
        title: 'Result',
        metadata: {}
      })
    })

    const initialized = await tool.init()
    await expect(async () =>
      initialized.execute(
        { count: 'not_a_number' as unknown as number, label: 123 as unknown as string },
        makeCtx()
      )
    ).rejects.toThrow(ToolSchemaValidationError)
  })

  it('passes validated args to execute on valid input', async () => {
    const tool = define('echo_tool', {
      description: 'Echoes input',
      parameters: z.object({ msg: z.string() }),
      execute: async (args) => ({ output: args.msg, title: 'Echo', metadata: {} })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ msg: 'hello world' }, makeCtx())
    expect(result.output).toBe('hello world')
  })

  it('supports custom formatValidationError', async () => {
    const tool = define('custom_err', {
      description: 'Custom error format',
      parameters: z.object({ x: z.number() }),
      execute: async (args) => ({ output: `x=${args.x}`, title: 'Result', metadata: {} }),
      formatValidationError: (error) =>
        `CUSTOM_ERROR: ${error.issues.map((i) => i.message).join('; ')}`
    })

    const initialized = await tool.init()
    await expect(async () =>
      initialized.execute({ x: 'bad' as unknown as number }, makeCtx())
    ).rejects.toThrow('CUSTOM_ERROR')
  })

  it('exposes structured validation payloads', async () => {
    const tool = define('payload_tool', {
      description: 'Structured validation',
      parameters: z.object({ path: z.string() }),
      execute: async (args) => ({ output: args.path })
    })

    const initialized = await tool.init()

    try {
      await initialized.execute({ path: 123 as unknown as string }, makeCtx())
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ToolSchemaValidationError)
      expect((error as ToolSchemaValidationError).payload).toMatchObject({
        type: 'schema_validation',
        tool: 'payload_tool',
        issues: [{ path: 'path' }]
      })
    }
  })

  it('handles z.enum with enum values', async () => {
    const tool = define('enum_tool', {
      description: 'Has enum',
      parameters: z.object({
        color: z.enum(['red', 'green', 'blue'])
      }),
      execute: async (args) => ({ output: args.color, title: 'Color', metadata: {} })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ color: 'red' }, makeCtx())
    expect(result.output).toBe('red')
  })

  it('handles z.array with items schema', async () => {
    const tool = define('array_tool', {
      description: 'Has array',
      parameters: z.object({
        items: z.array(z.string())
      }),
      execute: async (args) => ({ output: args.items.join(','), title: 'Array', metadata: {} })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ items: ['a', 'b', 'c'] }, makeCtx())
    expect(result.output).toBe('a,b,c')
  })

  it('handles z.boolean', async () => {
    const tool = define('bool_tool', {
      description: 'Has boolean',
      parameters: z.object({ active: z.boolean() }),
      execute: async (args) => ({ output: String(args.active), title: 'Bool', metadata: {} })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ active: true }, makeCtx())
    expect(result.output).toBe('true')
  })

  it('handles z.default fields (not required)', async () => {
    const tool = define('default_tool', {
      description: 'Has defaults',
      parameters: z.object({
        name: z.string(),
        greeting: z.string().default('hello')
      }),
      execute: async (args) => ({
        output: `${args.greeting} ${args.name}`,
        title: 'Greeting',
        metadata: {}
      })
    })

    const initialized = await tool.init()
    const result = await initialized.execute(
      { name: 'World' } as Parameters<typeof initialized.execute>[0],
      makeCtx()
    )
    expect(result.output).toBe('hello World')
  })

  it('returns ExecuteResult with title and metadata', async () => {
    const tool = define('meta_tool', {
      description: 'Returns metadata',
      parameters: z.object({ x: z.number() }),
      execute: async (args) => ({
        output: `result: ${args.x}`,
        title: 'Computation',
        metadata: { computationTime: 42 }
      })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ x: 5 }, makeCtx())
    expect(result.output).toBe('result: 5')
    expect(result.title).toBe('Computation')
    expect(result.metadata?.computationTime).toBe(42)
  })

  it('supports union types', async () => {
    const tool = define('union_tool', {
      description: 'Has union',
      parameters: z.object({
        value: z.union([z.string(), z.number()])
      }),
      execute: async (args) => ({ output: String(args.value), title: 'Union', metadata: {} })
    })

    const initialized = await tool.init()
    const result1 = await initialized.execute({ value: 'test' }, makeCtx())
    expect(result1.output).toBe('test')
    const result2 = await initialized.execute({ value: 42 }, makeCtx())
    expect(result2.output).toBe('42')
  })

  it.skip('supports record types - Zod v4 compatibility issue', async () => {
    const tool = define('record_tool', {
      description: 'Has record',
      parameters: z.object({
        data: z.record(z.string(), z.string())
      }),
      execute: async (args) => ({
        output: JSON.stringify(args.data),
        title: 'Record',
        metadata: {}
      })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ data: { key: 'value' } }, makeCtx())
    expect(result.output).toBe('{"key":"value"}')
  })

  it('supports tuple types', async () => {
    const tool = define('tuple_tool', {
      description: 'Has tuple',
      parameters: z.object({
        pair: z.tuple([z.string(), z.number()])
      }),
      execute: async (args) => ({
        output: `${args.pair[0]}:${args.pair[1]}`,
        title: 'Tuple',
        metadata: {}
      })
    })

    const initialized = await tool.init()
    const result = await initialized.execute({ pair: ['hello', 42] }, makeCtx())
    expect(result.output).toBe('hello:42')
  })
})
