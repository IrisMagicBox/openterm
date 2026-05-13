import { describe, expect, it, vi } from 'vitest'
import updatePlanTool from '../update-plan'
import type { Tool } from '../tool-factory'

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
    agent: 'build',
    updatePartMetadata: vi.fn()
  }
}

describe('update_plan tool', () => {
  it('records a complete visible plan in part metadata', async () => {
    const tool = await updatePlanTool.init()
    const ctx = makeCtx()

    const result = await tool.execute(
      {
        items: [
          { step: '梳理消息事件流', status: 'completed' },
          { step: '实现已处理折叠', status: 'in_progress' },
          { step: '运行类型检查', status: 'pending' }
        ],
        explanation: '复杂 UI 调整需要分阶段推进'
      },
      ctx
    )

    expect(result.output).toContain('Plan updated.')
    expect(ctx.updatePartMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        planTool: true,
        title: '更新任务规划',
        explanation: '复杂 UI 调整需要分阶段推进',
        planItems: [
          { step: '梳理消息事件流', status: 'completed' },
          { step: '实现已处理折叠', status: 'in_progress' },
          { step: '运行类型检查', status: 'pending' }
        ]
      })
    )
    expect(result.metadata).toMatchObject({ planTool: true })
  })

  it('rejects plans with more than one in-progress item', async () => {
    const tool = await updatePlanTool.init()
    const ctx = makeCtx()

    const result = await tool.execute(
      {
        items: [
          { step: '实现前端折叠', status: 'in_progress' },
          { step: '补充后端工具', status: 'in_progress' }
        ]
      },
      ctx
    )

    expect(result.output).toContain('at most one in_progress')
    expect(ctx.updatePartMetadata).not.toHaveBeenCalled()
    expect(result.metadata).toMatchObject({ planError: 'multiple_in_progress' })
  })
})
