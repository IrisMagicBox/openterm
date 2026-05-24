import { z } from 'zod'
import { artifactDB } from '../db'
import { define, Tool } from './tool-factory'
import type { ArtifactType } from '../../shared/types'
import { agentRunStore } from '../agent/agent-run-store'

const parameters = z.object({
  type: z.enum(['report', 'script', 'diff', 'log', 'note']).describe('Artifact 类型'),
  title: z.string().min(1).max(160).describe('Artifact 标题'),
  content: z
    .string()
    .optional()
    .describe(
      'Artifact 内容。若刚刚已经在 assistant 正文完整输出了内容，可省略并设置 source 为 latest_assistant_output，避免重复传输大段文本。'
    ),
  source: z
    .enum(['latest_assistant_output'])
    .optional()
    .describe('从最近一段 assistant 正文创建 Artifact，适合保存刚刚已展示的长报告。'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('可选结构化元数据')
})

function latestAssistantOutput(ctx: Tool.Context): string {
  if (!ctx.runId || !ctx.partId) return ''
  const parts = agentRunStore.getParts(ctx.runId)
  const current = parts.find((part) => part.id === ctx.partId)
  const currentOrder = current?.orderIndex ?? Number.POSITIVE_INFINITY
  const currentCreatedAt = current?.createdAt ?? Number.POSITIVE_INFINITY
  return (
    [...parts]
      .filter((part) => {
        if (part.type !== 'text' || part.role !== 'assistant' || !part.output?.trim()) return false
        if (part.messageId) return false
        return (
          part.orderIndex < currentOrder ||
          (part.orderIndex === currentOrder && part.createdAt < currentCreatedAt)
        )
      })
      .sort((a, b) => b.orderIndex - a.orderIndex || b.createdAt - a.createdAt)[0]?.output ?? ''
  )
}

function resolveArtifactContent(args: z.infer<typeof parameters>, ctx: Tool.Context): string {
  const directContent = args.content?.trim()
  if (directContent) return args.content ?? ''
  if (args.source === 'latest_assistant_output') return latestAssistantOutput(ctx)
  return ''
}

export default define('create_artifact', {
  description:
    '将重要产物保存到当前任务的 Artifact 区域。适合沉淀报告、脚本、diff、日志摘录或任务笔记；不要用于普通简短回复。如果报告已经作为 assistant 正文输出，优先用 source=latest_assistant_output，不要把同一大段内容再次放进 content。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const content = resolveArtifactContent(args, ctx)
    if (!content.trim()) {
      throw new Error('create_artifact requires non-empty content or source=latest_assistant_output.')
    }
    const metadata = {
      ...(args.metadata ?? {}),
      runId: ctx.runId,
      partId: ctx.partId,
      stepId: ctx.stepId,
      agent: ctx.agent,
      ...(args.source ? { source: args.source } : {})
    }
    const artifact = artifactDB.createArtifact({
      taskId: ctx.taskId,
      type: args.type as ArtifactType,
      title: args.title.trim(),
      content,
      metadata
    })
    const result = {
      artifactId: artifact.id,
      taskId: artifact.taskId,
      type: artifact.type,
      title: artifact.title,
      contentLength: artifact.content.length
    }

    ctx.updatePartMetadata?.({
      artifactId: artifact.id,
      artifactType: artifact.type,
      artifactTitle: artifact.title,
      contentLength: artifact.content.length
    })

    return {
      output: JSON.stringify(result),
      title: `Artifact: ${artifact.title}`,
      metadata: {
        ...metadata,
        artifactId: artifact.id,
        artifactType: artifact.type,
        artifactTitle: artifact.title,
        contentLength: artifact.content.length
      }
    }
  }
})
