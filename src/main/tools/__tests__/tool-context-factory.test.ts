import { describe, expect, it, vi } from 'vitest'
import type { AgentContext } from '../../AgentRunner'
import type { AgentConfig } from '../../agent/agent-config'
import { ToolContextFactory } from '../tool-context-factory'

vi.mock('../../agent/agent-run-store', () => ({
  agentRunStore: {
    appendMetadata: vi.fn(),
    updatePart: vi.fn(),
    createPart: vi.fn()
  }
}))

function makeContext(): AgentContext {
  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    runId: 'run-1',
    webContents: {} as never,
    agentService: {
      getSessions: vi.fn(async () => []),
      createTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      renameTerminal: vi.fn(),
      updateHostMetadata: vi.fn(),
      searchTopics: vi.fn(async () => []),
      searchMemories: vi.fn(async () => []),
      getTopicHosts: vi.fn(async () => []),
      registerRunController: vi.fn(),
      unregisterRunController: vi.fn()
    } as never,
    ensureSession: vi.fn(),
    requestAuthorization: vi.fn(),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    abort: new AbortController().signal
  }
}

const config: AgentConfig = {
  name: 'build',
  description: 'test',
  mode: 'primary',
  allowedTools: [],
  permissions: [{ tool: '*', allowed: true }]
}

describe('ToolContextFactory', () => {
  it('requests authorization with the real tool name', async () => {
    const ask = vi.fn(async () => ({ approved: true, alwaysAllow: false }))
    const factory = new ToolContextFactory({
      context: makeContext(),
      runId: 'run-1',
      config,
      permissionEngine: { ask } as never
    })

    const context = factory.create('part-1', 'step-1', 'write_file')
    await context.requestAuthorization('write file', 'high', 'testing', { path: '/tmp/a' })

    expect(ask).toHaveBeenCalledWith({
      permission: 'write_file',
      pattern: 'write file',
      riskLevel: 'high',
      reason: 'testing',
      metadata: { toolName: 'write_file', path: '/tmp/a' }
    })
  })
})
