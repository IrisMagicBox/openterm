import { describe, expect, it } from 'vitest'
import type { AgentPart } from '../../../../shared/types'
import { shouldShowAgentLivePart } from '../agent-live-stream'
import { agentActivityLines, shouldShowAgentActivityDetail } from '../agent-activity-summary'
import { agentProcessParts } from '../agent-process-parts'
import { deriveAgentTasks } from '../agent-task-list'

function part(overrides: Partial<AgentPart>): AgentPart {
  return {
    id: 'part-1',
    runId: 'run-1',
    type: 'tool',
    status: 'running',
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('agent live stream visibility', () => {
  it('hides internal usage and error parts from the live chat bubble', () => {
    expect(shouldShowAgentLivePart(part({ type: 'usage' }))).toBe(false)
    expect(shouldShowAgentLivePart(part({ type: 'error', status: 'error' }))).toBe(false)
  })

  it('keeps real tool progress and failures visible', () => {
    expect(
      shouldShowAgentLivePart(
        part({ type: 'tool', toolName: 'execute_command', status: 'running' })
      )
    ).toBe(true)
    expect(
      shouldShowAgentLivePart(
        part({ type: 'tool', toolName: 'execute_command', status: 'error', error: 'exit 1' })
      )
    ).toBe(true)
  })

  it('hides user message parts from the live process list', () => {
    expect(shouldShowAgentLivePart(part({ type: 'text', role: 'user' }))).toBe(false)
  })

  it('keeps intermediate assistant text in process but not the final answer part', () => {
    const parts = [
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我先搜索资料。',
        orderIndex: 1,
        createdAt: 1
      }),
      part({
        id: 'tool-1',
        type: 'tool',
        toolName: 'websearch',
        status: 'completed',
        input: '{"query":"OpenTerm"}',
        orderIndex: 2,
        createdAt: 2
      }),
      part({
        id: 'answer-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        messageId: 'msg-1',
        output: '最终总结。',
        orderIndex: 3,
        createdAt: 3
      })
    ]

    expect(agentProcessParts(parts).map((item) => item.id)).toEqual(['thinking-1', 'tool-1'])
  })

  it('does not invent tasks from ordinary tool activity', () => {
    const tasks = deriveAgentTasks([
      part({
        id: 'tool-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"npm test"}',
        orderIndex: 1
      }),
      part({
        id: 'tool-2',
        type: 'tool',
        toolName: 'websearch',
        status: 'completed',
        input: '{"query":"demo-cli latest version"}',
        orderIndex: 2
      })
    ])

    expect(tasks).toEqual([])
  })

  it('shows explicit update_plan items as task list', () => {
    const tasks = deriveAgentTasks([
      part({
        id: 'tool-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"npm test"}',
        orderIndex: 1
      }),
      part({
        id: 'plan-1',
        type: 'tool',
        toolName: 'update_plan',
        status: 'completed',
        metadata: {
          planTool: true,
          planItems: [
            { step: '梳理消息事件流', status: 'completed' },
            { step: '实现已处理折叠块', status: 'in_progress' },
            { step: '验证规划展示', status: 'pending' }
          ]
        },
        orderIndex: 2
      })
    ])

    expect(tasks.map((task) => [task.title, task.status, task.explicit])).toEqual([
      ['梳理消息事件流', 'completed', true],
      ['实现已处理折叠块', 'running', true],
      ['验证规划展示', 'pending', true]
    ])
  })

  it('renders readable process labels for common agent actions', () => {
    const lines = agentActivityLines([
      part({
        id: 'notes-1',
        type: 'tool',
        toolName: 'read_notes',
        status: 'completed',
        input: '{"target":"host","targetId":"shelley-test"}',
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"demo-cli --version"}',
        orderIndex: 2
      }),
      part({
        id: 'search-1',
        type: 'tool',
        toolName: 'websearch',
        status: 'completed',
        input: '{"query":"demo-cli latest version"}',
        orderIndex: 3
      }),
      part({
        id: 'permission-1',
        type: 'permission',
        status: 'blocked',
        input: 'demo-cli latest version',
        metadata: {
          permission: 'websearch',
          reason: '需要联网确认最新版本'
        },
        orderIndex: 4
      })
    ])

    expect(lines.map((line) => [line.label, line.detail])).toEqual([
      ['读取备注', '主机 shelley-test'],
      ['运行命令', 'demo-cli --version'],
      ['搜索网页', 'demo-cli latest version'],
      ['等待确认', '需要联网确认最新版本']
    ])
  })

  it('does not drop readable labels after the first 12 activity lines', () => {
    const lines = agentActivityLines(
      Array.from({ length: 14 }, (_, index) =>
        part({
          id: `cmd-${index}`,
          type: 'tool',
          toolName: 'execute_command',
          status: 'completed',
          input: `{"command":"echo ${index}"}`,
          orderIndex: index
        })
      )
    )

    expect(lines).toHaveLength(14)
    expect(lines[13]).toMatchObject({
      label: '运行命令',
      detail: 'echo 13'
    })
  })

  it('hides completed process parts that have no readable content', () => {
    const parts = [
      part({
        id: 'empty-thinking',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '',
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"uname -s"}',
        orderIndex: 2
      })
    ]

    expect(agentProcessParts(parts).map((item) => item.id)).toEqual(['cmd-1'])
  })

  it('only offers expanded activity detail when it adds information', () => {
    const [permissionLine, commandLine, longThinkingLine] = agentActivityLines([
      part({
        id: 'permission-1',
        type: 'permission',
        status: 'completed',
        metadata: {
          reason: '备份当前版本并下载最新稳定版 Shelley'
        },
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"uname -s"}',
        output: '{"content":"Exit 0\\nLinux"}',
        orderIndex: 2
      }),
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output:
          '这是一段比较长的思考内容，用来确认超过单行摘要长度时依然可以展开查看完整内容。'.repeat(
            3
          ),
        orderIndex: 3
      })
    ])

    expect(permissionLine.detail).toBe(permissionLine.fullDetail)
    expect(shouldShowAgentActivityDetail(permissionLine)).toBe(false)
    expect(shouldShowAgentActivityDetail(commandLine)).toBe(true)
    expect(shouldShowAgentActivityDetail(longThinkingLine)).toBe(true)
  })
})
