import { describe, expect, it } from 'vitest'
import type { AgentPart } from '../../../../shared/types'
import { shouldShowAgentLivePart } from '../agent-live-stream'
import { shouldShowLiveRawOutputFallback } from '../../components/AgentLiveStream'
import { agentActivityLines, shouldShowAgentActivityDetail } from '../agent-activity-summary'
import {
  agentProcessParts,
  agentRawProcessParts,
  agentSummaryParts,
  latestLiveAssistantTextPart
} from '../agent-process-parts'
import { permissionPartsByParent, permissionTooltipText } from '../agent-permission-parts'
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
    expect(shouldShowAgentLivePart(part({ type: 'permission', status: 'completed' }))).toBe(false)
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

  it('does not show raw live fallback for assistant markdown text', () => {
    expect(
      shouldShowLiveRawOutputFallback(
        part({
          type: 'text',
          role: 'assistant',
          status: 'running',
          output: '### 标题\n\n- 列表'
        })
      )
    ).toBe(false)
    expect(
      shouldShowLiveRawOutputFallback(
        part({
          type: 'tool',
          toolName: 'execute_command',
          status: 'running',
          output: '{"content":"streaming output","exitCode":0}'
        })
      )
    ).toBe(true)
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

  it('keeps intermediate assistant text but not the final answer in the raw process projection', () => {
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

    expect(agentRawProcessParts(parts).map((item) => item.id)).toEqual(['thinking-1', 'tool-1'])
  })

  it('separates only the latest live assistant text from the raw process projection', () => {
    const parts = [
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我先确认配置来源。',
        orderIndex: 1,
        createdAt: 1
      }),
      part({
        id: 'streaming-answer',
        type: 'text',
        role: 'assistant',
        status: 'running',
        output: '## 配置报告\n\n正在整理结果。',
        orderIndex: 2,
        createdAt: 2
      }),
      part({
        id: 'tool-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'pending',
        input: '{"command":"kubectl get configmap"}',
        orderIndex: 3,
        createdAt: 3
      })
    ]

    expect(latestLiveAssistantTextPart(parts)).toBeUndefined()
    expect(agentRawProcessParts(parts).map((item) => item.id)).toEqual([
      'thinking-1',
      'streaming-answer',
      'tool-1'
    ])
  })

  it('keeps the latest live assistant text as the main stream until a tool call appears', () => {
    const parts = [
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我先确认配置来源。',
        orderIndex: 1,
        createdAt: 1
      }),
      part({
        id: 'tool-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"kubectl get configmap"}',
        orderIndex: 2,
        createdAt: 2
      }),
      part({
        id: 'streaming-answer',
        type: 'text',
        role: 'assistant',
        status: 'running',
        output: '## 配置报告\n\n正在整理结果。',
        orderIndex: 3,
        createdAt: 3
      })
    ]

    expect(latestLiveAssistantTextPart(parts)?.id).toBe('streaming-answer')
    expect(agentRawProcessParts(parts).map((item) => item.id)).toEqual(['thinking-1', 'tool-1'])
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
        id: 'hosts-1',
        type: 'tool',
        toolName: 'list_hosts',
        status: 'completed',
        input: '{}',
        orderIndex: 0
      }),
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
        parentPartId: 'search-1',
        input: 'demo-cli latest version',
        metadata: {
          permission: 'websearch',
          reason: '需要联网确认最新版本'
        },
        orderIndex: 4
      })
    ])

    expect(lines.map((line) => [line.label, line.detail])).toEqual([
      ['查看主机', ''],
      ['读取备注', '主机 shelley-test'],
      ['运行命令', 'demo-cli --version'],
      ['搜索网页', 'demo-cli latest version']
    ])
  })

  it('summarizes create_artifact calls without expanding full content', () => {
    const longContent = '# Report\n\n' + 'findings '.repeat(80)
    const [line] = agentActivityLines([
      part({
        id: 'artifact-1',
        type: 'tool',
        toolName: 'create_artifact',
        status: 'completed',
        input: JSON.stringify({
          title: 'Hermes Agent 深度调研报告',
          type: 'report',
          content: longContent
        }),
        metadata: {
          artifactId: 'artifact-1',
          artifactTitle: 'Hermes Agent 深度调研报告',
          artifactType: 'report',
          contentLength: longContent.length
        },
        orderIndex: 1
      })
    ])

    expect(line).toMatchObject({
      label: '保存 Artifact',
      detail: `Hermes Agent 深度调研报告 · report · ${longContent.length} 字`
    })
    expect(line.sections[0].content).toContain('已省略')
    expect(line.sections[0].content).toContain(String(longContent.length))
    expect(line.sections[0].content).not.toContain('findings findings findings')
  })

  it('keeps permission parts out of the main process projection and attaches them to tools', () => {
    const parts = [
      part({
        id: 'fetch-1',
        type: 'tool',
        toolName: 'webfetch',
        status: 'completed',
        input: '{"url":"https://example.com"}',
        orderIndex: 1
      }),
      part({
        id: 'permission-1',
        type: 'permission',
        status: 'completed',
        parentPartId: 'fetch-1',
        input: 'https://example.com',
        metadata: {
          permission: 'webfetch',
          reason: 'Permission required: webfetch for pattern "https://example.com"',
          riskLevel: 'medium',
          scope: 'turn'
        },
        orderIndex: 2
      })
    ]

    expect(agentRawProcessParts(parts).map((item) => item.id)).toEqual(['fetch-1'])
    expect(permissionPartsByParent(parts).get('fetch-1')?.map((item) => item.id)).toEqual([
      'permission-1'
    ])
    expect(permissionTooltipText(parts[1])).toContain('范围：本轮')
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

  it('keeps identical completed observations and tool activity in the raw process list', () => {
    const parts = [
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我需要查看 nginx 错误日志。',
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"tail -100 /var/log/nginx/error.log"}',
        output: '{"content":"no error log","exitCode":0}',
        orderIndex: 2
      }),
      part({
        id: 'thinking-2',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我需要查看 nginx 错误日志。',
        orderIndex: 3
      }),
      part({
        id: 'cmd-2',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"tail -100 /var/log/nginx/error.log"}',
        output: '{"content":"no error log","exitCode":0}',
        orderIndex: 4
      }),
      part({
        id: 'cmd-running',
        type: 'tool',
        toolName: 'execute_command',
        status: 'running',
        input: '{"command":"tail -100 /var/log/nginx/error.log"}',
        orderIndex: 5
      })
    ]

    expect(agentProcessParts(parts).map((item) => item.id)).toEqual([
      'thinking-1',
      'cmd-1',
      'thinking-2',
      'cmd-2',
      'cmd-running'
    ])
  })

  it('deduplicates identical completed observations only in the summary projection', () => {
    const parts = [
      part({
        id: 'thinking-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我需要查看 nginx 错误日志。',
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"tail -100 /var/log/nginx/error.log"}',
        output: '{"content":"no error log","exitCode":0}',
        orderIndex: 2
      }),
      part({
        id: 'thinking-2',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我需要查看 nginx 错误日志。',
        orderIndex: 3
      }),
      part({
        id: 'cmd-2',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"tail -100 /var/log/nginx/error.log"}',
        output: '{"content":"no error log","exitCode":0}',
        orderIndex: 4
      })
    ]

    expect(agentSummaryParts(parts).map((item) => item.id)).toEqual(['thinking-1', 'cmd-1'])
  })

  it('only offers expanded activity detail when it adds information', () => {
    const [commandLine, longThinkingLine] = agentActivityLines([
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

    expect(shouldShowAgentActivityDetail(commandLine)).toBe(true)
    expect(shouldShowAgentActivityDetail(longThinkingLine)).toBe(true)
  })

  it('builds nested process detail sections for observations and tool results', () => {
    const [observationLine, commandLine] = agentActivityLines([
      part({
        id: 'observation-1',
        type: 'text',
        role: 'assistant',
        status: 'completed',
        output: '我已经确认需要先查看系统版本。',
        orderIndex: 1
      }),
      part({
        id: 'cmd-1',
        type: 'tool',
        toolName: 'execute_command',
        status: 'completed',
        input: '{"command":"uname -s","hostId":"local"}',
        output: '{"content":"Linux\\n","exitCode":0}',
        orderIndex: 2
      })
    ])

    expect(observationLine).toMatchObject({
      label: '模型输出',
      detail: '我已经确认需要先查看系统版本。'
    })
    expect(observationLine.sections).toEqual([
      {
        id: 'observation-1:observation',
        label: '模型输出',
        content: '我已经确认需要先查看系统版本。',
        tone: 'observation',
        defaultOpen: false
      }
    ])
    expect(commandLine.sections.map((section) => [section.label, section.tone])).toEqual([
      ['工具调用', 'call'],
      ['工具结果', 'result']
    ])
    expect(commandLine.sections[0].content).toContain('"command": "uname -s"')
    expect(commandLine.sections[1].content).toBe('Exit 0\nLinux')
    expect(shouldShowAgentActivityDetail(commandLine)).toBe(true)
  })
})
