import { describe, it, expect } from 'vitest'
import type { Host, Topic, Message, TerminalSession, Provider, Task, CommandResult } from '../types'
import type {
  TaskStatus,
  ApprovalRiskLevel,
  PolicyRiskCategory,
  TerminalSessionStatus,
  TrustLevel,
  MemoryType,
  AgentPartType,
  AgentRunStopReason
} from '../types'

describe('Shared Types - Host', () => {
  it('should accept a Host with all required fields', () => {
    const host: Host = {
      id: '1',
      alias: 'test-server',
      ip: '192.168.1.1',
      port: 22,
      username: 'root',
      tags: ['prod'],
      createdAt: Date.now()
    }
    expect(host.id).toBe('1')
    expect(host.alias).toBe('test-server')
    expect(host.ip).toBe('192.168.1.1')
    expect(host.port).toBe(22)
    expect(host.username).toBe('root')
    expect(host.tags).toEqual(['prod'])
  })

  it('should accept a Host with optional password and keyPath', () => {
    const host: Host = {
      id: '2',
      alias: 'key-host',
      ip: '10.0.0.1',
      port: 2222,
      username: 'admin',
      password: 'secret',
      keyPath: '/home/user/.ssh/id_rsa',
      tags: [],
      createdAt: Date.now()
    }
    expect(host.password).toBe('secret')
    expect(host.keyPath).toBe('/home/user/.ssh/id_rsa')
  })
})

describe('Shared Types - Topic', () => {
  it('should accept a Topic with required fields', () => {
    const topic: Topic = {
      id: 't1',
      title: 'Deploy discussion',
      hostIds: ['h1', 'h2'],
      lastMessageAt: Date.now(),
      createdAt: Date.now()
    }
    expect(topic.id).toBe('t1')
    expect(topic.title).toBe('Deploy discussion')
    expect(topic.hostIds).toHaveLength(2)
  })
})

describe('Shared Types - Message', () => {
  it('should accept a Message with required fields', () => {
    const msg: Message = {
      id: 'm1',
      topicId: 't1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now()
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
  })

  it('should accept a Message with optional toolCalls', () => {
    const msg: Message = {
      id: 'm2',
      topicId: 't1',
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'execute_command', arguments: '{"cmd":"ls"}' }
        }
      ]
    }
    expect(msg.toolCalls).toHaveLength(1)
    expect(msg.toolCalls![0].function.name).toBe('execute_command')
  })
})

describe('Shared Types - TerminalSession', () => {
  it('should accept a TerminalSession with required fields', () => {
    const session: TerminalSession = {
      id: 's1',
      topicId: 't1',
      hostId: 'h1',
      hostAlias: 'web-server',
      status: 'active',
      shellIntegrationReady: true,
      createdAt: Date.now()
    }
    expect(session.status).toBe('active')
    expect(session.shellIntegrationReady).toBe(true)
  })

  it('should accept a TerminalSession with all optional fields', () => {
    const session: TerminalSession = {
      id: 's2',
      topicId: 't1',
      hostId: 'h1',
      hostAlias: 'web-server',
      status: 'streaming',
      shellType: 'bash',
      shellIntegrationReady: false,
      isLocked: true,
      lockedBy: 'agent',
      isPinned: true,
      visible: true,
      paused: false,
      command: 'npm test',
      commandStatus: 'running',
      createdAt: Date.now()
    }
    expect(session.lockedBy).toBe('agent')
    expect(session.command).toBe('npm test')
  })
})

describe('Shared Types - Provider', () => {
  it('should accept a Provider with required fields', () => {
    const provider: Provider = {
      id: 'p1',
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'sk-test',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    expect(provider.type).toBe('openai')
    expect(provider.enabled).toBe(true)
  })
})

describe('Shared Types - Union types', () => {
  it('should have correct TaskStatus values', () => {
    const statuses: TaskStatus[] = [
      'pending',
      'planning',
      'running',
      'waiting_approval',
      'completed',
      'failed',
      'cancelled'
    ]
    expect(statuses).toHaveLength(7)
    expect(statuses).toContain('running')
  })

  it('should have correct ApprovalRiskLevel values', () => {
    const levels: ApprovalRiskLevel[] = ['low', 'medium', 'high', 'critical']
    expect(levels).toHaveLength(4)
  })

  it('should have correct PolicyRiskCategory values', () => {
    const categories: PolicyRiskCategory[] = [
      'read',
      'write',
      'network',
      'package',
      'privilege',
      'destructive'
    ]
    expect(categories).toHaveLength(6)
  })

  it('should have correct TerminalSessionStatus values', () => {
    const statuses: TerminalSessionStatus[] = ['active', 'streaming', 'closed', 'disconnected']
    expect(statuses).toHaveLength(4)
  })

  it('should have correct TrustLevel values', () => {
    const levels: TrustLevel[] = ['untrusted', 'familiar', 'trusted']
    expect(levels).toHaveLength(3)
  })

  it('should have correct MemoryType values', () => {
    const types: MemoryType[] = [
      'user_preference',
      'host_fact',
      'topic_summary',
      'task_experience',
      'policy_hint'
    ]
    expect(types).toHaveLength(5)
  })

  it('should include runtime upgrade AgentPartType values', () => {
    const types: AgentPartType[] = [
      'text',
      'reasoning',
      'tool',
      'permission',
      'compaction',
      'subagent',
      'usage',
      'error',
      'step',
      'step_start',
      'step_finish',
      'snapshot',
      'patch'
    ]
    expect(types).toContain('step_start')
    expect(types).toContain('patch')
  })

  it('should include AgentRunStopReason values', () => {
    const reasons: AgentRunStopReason[] = [
      'completed',
      'max_turns',
      'context_overflow',
      'provider_error',
      'tool_error',
      'permission_rejected',
      'aborted',
      'blocked_empty_response'
    ]
    expect(reasons).toContain('provider_error')
    expect(reasons).toContain('blocked_empty_response')
  })
})

describe('Shared Types - Task', () => {
  it('should accept a Task with required fields', () => {
    const task: Task = {
      id: 'task1',
      topicId: 't1',
      title: 'Check disk space',
      goal: 'Verify disk usage on server',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    expect(task.status).toBe('running')
    expect(task.goal).toBe('Verify disk usage on server')
  })
})

describe('Shared Types - CommandResult', () => {
  it('should accept a CommandResult', () => {
    const result: CommandResult = {
      content: 'Filesystem  Size  Used  Avail  Use%',
      exitCode: 0,
      durationMs: 120,
      isTruncated: false,
      sessionId: 's1'
    }
    expect(result.exitCode).toBe(0)
    expect(result.isTruncated).toBe(false)
  })
})
