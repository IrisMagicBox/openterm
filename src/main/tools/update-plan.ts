import { z } from 'zod'
import { define, Tool } from './tool-factory'

const planItemSchema = z.object({
  step: z.string().min(1).max(140).describe('任务步骤，使用简短动宾短语'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('步骤状态')
})

const parameters = z.object({
  items: z
    .array(planItemSchema)
    .min(1)
    .max(8)
    .describe('当前完整任务规划列表。复杂任务通常 2-6 项，简单任务不要调用本工具。'),
  explanation: z.string().max(240).optional().describe('本次规划更新的简短原因')
})

export default define('update_plan', {
  description:
    '更新当前任务的用户可见规划列表。仅在需要用户持续理解进度的复杂、多阶段执行任务中使用；状态检查、资料查询、升级建议、简单问答或单步操作不要调用。每次调用都传入完整列表，最多一个 in_progress。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const inProgressCount = args.items.filter((item) => item.status === 'in_progress').length
    if (inProgressCount > 1) {
      return {
        output:
          'Error: update_plan requires at most one in_progress item. Please send the full plan again.',
        metadata: {
          planTool: true,
          planError: 'multiple_in_progress'
        }
      }
    }

    const metadata = {
      planTool: true,
      title: '更新任务规划',
      planItems: args.items,
      explanation: args.explanation
    }
    ctx.updatePartMetadata?.(metadata)

    const lines = args.items.map((item, index) => `${index + 1}. [${item.status}] ${item.step}`)
    return {
      output: ['Plan updated.', ...lines].join('\n'),
      metadata
    }
  }
})
