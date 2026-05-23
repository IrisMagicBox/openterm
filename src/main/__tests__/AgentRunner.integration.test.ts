/**
 * Integration tests for AgentRunner's subsystem integration.
 *
 * These tests verify that AgentConfig permissions,
 * EventBus, ContextAssembler, and StructuredObservation are properly
 * wired into the AgentRunner flow — without requiring a live LLM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRunner, type AgentContext } from '../AgentRunner'
import type { AgentSession } from '../agent'
import { eventBus, type EventMap } from '../agent/event-bus'
import { getAgentConfig } from '../agent/agent-config'
import { formatObservation, fromCommandResult } from '../tools/observation'

// Mock external dependencies
vi.mock('../ai', () => ({
  getAIClient: vi.fn(),
  getCurrentModel: vi.fn(() => 'test-model'),
  SYSTEM_PROMPT: 'Test system prompt'
}))

vi.mock('../terminal', () => ({
  commandExecutor: {
    buildTerminalContext: vi.fn(() => 'Terminal context')
  }
}))

vi.mock('../db', () => ({
  messageDB: { createMessage: vi.fn() },
  taskDB: { updateTask: vi.fn() },
  taskStepDB: { createStep: vi.fn(() => {}), updateStep: vi.fn() }
}))

vi.mock('../MemoryManager', () => ({
  MemoryManager: {
    recallRelevantContext: vi.fn(async () => ''),
    reflectOnTask: vi.fn(async () => {}),
    distillObservation: vi.fn(async () => 'Distilled observation')
  }
}))

vi.mock('../tools', () => {
  const registry = {
    getFilteredDefinitions: vi.fn(() => []),
    execute: vi.fn(async () => ({
      output:
        '{"content":"output","exitCode":0,"durationMs":100,"isTruncated":false,"sessionId":"s1"}'
    })),
    register: vi.fn(),
    getDefinitions: vi.fn(() => []),
    initializeTools: vi.fn(async () => {})
  }
  return {
    createDefaultRegistry: vi.fn(() => registry),
    ToolRegistry: vi.fn(() => registry)
  }
})

function createMockContext(): AgentContext {
  const session: AgentSession = {
    id: 'session-1',
    topicId: 'topic-1',
    hostId: 'local',
    hostAlias: 'Local',
    status: 'active',
    shellIntegrationReady: false,
    createdAt: Date.now(),
    paused: false
  }

  return {
    topicId: 'topic-1',
    taskId: 'task-1',
    agentName: undefined,
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false)
    } as unknown as AgentContext['webContents'],
    agentService: {
      getSessions: vi.fn(async () => []),
      createTerminal: vi.fn(async () => session),
      closeTerminal: vi.fn(async () => {}),
      renameTerminal: vi.fn(async () => {}),
      updateHostMetadata: vi.fn(async () => {}),
      searchTopics: vi.fn(async () => []),
      searchMemories: vi.fn(async () => []),
      getTopicHosts: vi.fn(async () => []),
      registerRunController: vi.fn(),
      unregisterRunController: vi.fn()
    },
    ensureSession: vi.fn(async () => 'session-1'),
    requestAuthorization: vi.fn(async () => ({ approved: true, alwaysAllow: false })),
    notifyStep: vi.fn(),
    metadata: vi.fn(),
    stepId: undefined
  }
}

describe('AgentRunner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.clear()
  })

  describe('Permission enforcement', () => {
    it('explore agent rejects high-risk commands via maxAutoApproveRisk', async () => {
      const context = createMockContext()
      const originalAuth = vi.fn(async () => ({ approved: true, alwaysAllow: false }))
      context.requestAuthorization = originalAuth

      void new AgentRunner(context, 'explore')

      const result = await context.requestAuthorization('rm -rf /', 'high', 'testing')

      expect(result.approved).toBe(false)
      expect(result.alwaysAllow).toBe(false)
      expect(originalAuth).not.toHaveBeenCalled()
    })

    it('explore agent allows low-risk commands', async () => {
      const context = createMockContext()
      const originalAuth = vi.fn(async () => ({ approved: true, alwaysAllow: false }))
      context.requestAuthorization = originalAuth

      void new AgentRunner(context, 'explore')

      const result = await context.requestAuthorization('ls -la', 'low', 'listing files')

      expect(result.approved).toBe(true)
      expect(originalAuth).toHaveBeenCalledWith('ls -la', 'low', 'listing files', undefined)
    })

    it('build agent allows all risk levels', async () => {
      const context = createMockContext()
      const originalAuth = vi.fn(async () => ({ approved: true, alwaysAllow: false }))
      context.requestAuthorization = originalAuth

      void new AgentRunner(context, 'build')

      const result = await context.requestAuthorization('rm -rf /', 'critical', 'testing')

      expect(result.approved).toBe(true)
      expect(originalAuth).toHaveBeenCalledWith('rm -rf /', 'critical', 'testing', undefined)
    })
  })

  describe('EventBus integration', () => {
    it('constructor sets webContents on eventBus', () => {
      const context = createMockContext()
      void new AgentRunner(context, 'build')

      // eventBus.setWebContents should have been called
      // We verify by publishing an event and checking webContents.send
      eventBus.publish('agent:thinking', {
        topicId: 'topic-1',
        thinking: true,
        taskId: 'task-1'
      })

      expect(context.webContents.send).toHaveBeenCalledWith('agent:thinking', {
        topicId: 'topic-1',
        thinking: true,
        taskId: 'task-1'
      })
    })

    it('eventBus validates payloads via Zod', () => {
      const context = createMockContext()
      void new AgentRunner(context, 'build')

      // This should be silently dropped (invalid payload)
      expect(() => {
        eventBus.publish('agent:thinking', {
          topicId: 123, // Should be string
          thinking: true,
          taskId: 'task-1'
        } as unknown as EventMap['agent:thinking'])
      }).not.toThrow()
    })
  })

  describe('AgentConfig system prompts', () => {
    it('explore agent has a specialized Chinese system prompt', () => {
      const config = getAgentConfig('explore')
      expect(config.systemPrompt).toBeDefined()
      expect(config.systemPrompt).toContain('探索代理')
      expect(config.systemPrompt).toContain('只读')
      expect(config.systemPrompt).toContain('可见工作过程')
      expect(config.systemPrompt).toContain('基于证据推进调查')
      expect(config.systemPrompt).toContain('当前判断、证据缺口或下一步决策')
      expect(config.systemPrompt).not.toContain('可公开进展')
    })

    it('verify agent has a specialized Chinese system prompt', () => {
      const config = getAgentConfig('verify')
      expect(config.systemPrompt).toBeDefined()
      expect(config.systemPrompt).toContain('验证代理')
      expect(config.systemPrompt).toContain('验证通过')
    })

    it('build agent has no system prompt override (uses default)', () => {
      const config = getAgentConfig('build')
      expect(config.systemPrompt).toBeUndefined()
    })
  })

  describe('StructuredObservation formatting', () => {
    it('fromCommandResult creates a valid StructuredObservation', () => {
      const result = fromCommandResult(
        {
          content: 'hello world',
          exitCode: 0,
          durationMs: 100,
          isTruncated: false,
          sessionId: 's1',
          cwd: '/home/user'
        },
        'host-1',
        'default'
      )

      expect(result.hostId).toBe('host-1')
      expect(result.terminalName).toBe('default')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello world')
    })

    it('formatObservation produces a clean, token-efficient string', () => {
      const obs = fromCommandResult(
        {
          content: 'hello world',
          exitCode: 0,
          durationMs: 100,
          isTruncated: false,
          sessionId: 's1',
          cwd: '/home/user'
        },
        'host-1',
        'default'
      )

      const formatted = formatObservation(obs)
      expect(formatted).toContain('[Host: host-1, Terminal: default]')
      expect(formatted).toContain('Exit: 0')
      expect(formatted).toContain('CWD: /home/user')
      expect(formatted).toContain('hello world')
    })
  })
})
