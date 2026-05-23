import { describe, expect, it, vi } from 'vitest'

vi.mock('../agent-run-store', () => ({
  agentRunStore: {
    createPart: vi.fn(),
    updatePart: vi.fn(),
    updateRun: vi.fn(),
    completeRun: vi.fn()
  }
}))

import { normalizeAgentError } from '../agent-error'
import {
  extractTextToolCalls,
  extractXmlToolCalls,
  inferToolNameFromArguments,
  resolveStreamedToolName
} from '../provider-stream-collector'

describe('ProviderStreamCollector tool-call normalization', () => {
  it('treats terminated network streams as retryable provider errors', () => {
    const normalized = normalizeAgentError(new Error('terminated'))

    expect(normalized.kind).toBe('server_error')
    expect(normalized.retryable).toBe(true)
  })

  it('ignores empty streamed tool names and infers execute_command from arguments', () => {
    const args = JSON.stringify({
      hostId: 'host-1',
      command: 'ip addr',
      reason: '查看网络接口配置'
    })

    expect(inferToolNameFromArguments(args)).toBe('execute_command')
    expect(resolveStreamedToolName('', undefined, args)).toBe('execute_command')
    expect(resolveStreamedToolName('', 'unknown', args)).toBe('execute_command')
  })

  it('preserves a previous concrete tool name when a later delta has an empty name', () => {
    expect(resolveStreamedToolName('', 'read_file', '{"path":"/tmp/a"}')).toBe('read_file')
  })

  it('extracts MiniMax XML invoke blocks into tool calls', () => {
    const result = extractXmlToolCalls(
      `
<invoke name="wait_terminal_text">
<parameter name="sessionId">session-1</parameter>
<parameter name="text">ALL complete</parameter>
<parameter name="timeoutMs">120000</parameter>
<parameter name="requireFreshMatch">true</parameter>
</invoke>
</minimax:tool_call>
`,
      new Set(['wait_terminal_text'])
    )

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('wait_terminal_text')
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({
      sessionId: 'session-1',
      text: 'ALL complete',
      timeoutMs: 120000,
      requireFreshMatch: true
    })
  })

  it('preserves surrounding assistant text when extracting XML tool calls', () => {
    const result = extractXmlToolCalls(
      `先等一下\n<invoke name="observe_terminal"><parameter name="sessionId">s1</parameter></invoke>\n稍后继续`,
      new Set(['observe_terminal'])
    )

    expect(result.content).toBe('先等一下\n稍后继续')
    expect(result.toolCalls).toHaveLength(1)
  })

  it('converts unknown XML invoke blocks to invalid_tool observations', () => {
    const raw = `<invoke name="unknown_tool"><parameter name="x">1</parameter></invoke>`
    const result = extractXmlToolCalls(raw, new Set(['observe_terminal']))

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('invalid_tool')
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toMatchObject({
      x: 1,
      tool: 'unknown_tool'
    })
  })

  it('repairs XML tool names with registered lowercase variants', () => {
    const result = extractXmlToolCalls(
      `<invoke name="OBSERVE_TERMINAL"><parameter name="sessionId">s1</parameter></invoke>`,
      new Set(['observe_terminal'])
    )

    expect(result.content).toBe('')
    expect(result.toolCalls[0].function.name).toBe('observe_terminal')
  })

  it('extracts text tool-call sections into real tool calls', () => {
    const result = extractTextToolCalls(
      `先看一下进度
<tool_calls_section_begin>
<tool_call_begin>functions.observe_terminal:9<tool_call_argument_begin>
{"hostId":"shelley-test","sessionId":"session-1","reason":"查看安装进度"}<tool_call_end>
<tool_calls_section_end>
稍后继续`,
      new Set(['observe_terminal'])
    )

    expect(result.content).toBe('先看一下进度\n\n稍后继续')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('observe_terminal')
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({
      hostId: 'shelley-test',
      sessionId: 'session-1',
      reason: '查看安装进度'
    })
  })

  it('extracts multiple text tool calls from one section', () => {
    const result = extractTextToolCalls(
      `<tool_calls_section_begin>
<tool_call_begin>functions.list_terminals:0<tool_call_argument_begin>{}<tool_call_end>
<tool_call_begin>functions.execute_command:1<tool_call_argument_begin>{"hostId":"h1","command":"pwd","reason":"确认路径"}<tool_call_end>
<tool_calls_section_end>`,
      new Set(['list_terminals', 'execute_command'])
    )

    expect(result.content).toBe('')
    expect(result.toolCalls.map((call) => call.function.name)).toEqual([
      'list_terminals',
      'execute_command'
    ])
    expect(result.toolCalls[0].id).not.toBe(result.toolCalls[1].id)
  })

  it('converts unknown text tool-call sections to invalid_tool observations', () => {
    const result = extractTextToolCalls(
      `<tool_calls_section_begin><tool_call_begin>functions.NOPE:9<tool_call_argument_begin>{"x":1}<tool_call_end><tool_calls_section_end>`,
      new Set(['observe_terminal'])
    )

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('invalid_tool')
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toMatchObject({
      x: 1,
      tool: 'NOPE'
    })
  })
})
