import { z } from 'zod'
import { artifactDB } from '../db'
import { define, Tool } from './tool-factory'
import type { ArtifactType } from '../../shared/types'

const parameters = z.object({
  type: z.enum(['report', 'script', 'diff', 'log', 'note']).describe('Artifact 类型'),
  title: z.string().min(1).max(160).describe('Artifact 标题'),
  content: z.string().min(1).describe('Artifact 内容'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('可选结构化元数据')
})

export default define('create_artifact', {
  description:
    '将重要产物保存到当前任务的 Artifact 区域。适合沉淀报告、脚本、diff、日志摘录或任务笔记；不要用于普通简短回复。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const metadata = {
      ...(args.metadata ?? {}),
      runId: ctx.runId,
      partId: ctx.partId,
      stepId: ctx.stepId,
      agent: ctx.agent
    }
    const artifact = artifactDB.createArtifact({
      taskId: ctx.taskId,
      type: args.type as ArtifactType,
      title: args.title.trim(),
      content: args.content,
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
