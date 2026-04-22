import { describe, expect, it, vi } from 'vitest'

vi.mock('../agent-run-store', () => ({
  agentRunStore: {
    createPart: vi.fn(),
    updatePart: vi.fn(),
    updateRun: vi.fn(),
    completeRun: vi.fn()
  }
}))

import {
  inferToolNameFromArguments,
  resolveStreamedToolName
} from '../provider-stream-collector'

describe('ProviderStreamCollector tool-call normalization', () => {
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
})
