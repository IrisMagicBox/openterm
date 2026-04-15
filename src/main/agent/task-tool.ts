/**
 * Subagent Task tool — spawns isolated child agent sessions.
 * Each subagent gets its own session ID and isolated context.
 * Child token usage is aggregated back into the parent session.
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { define, Tool } from '../tools/tool-factory'
import { getAgentConfig } from './agent-config'
import { AgentRunner } from '../AgentRunner'
import type { IAgentService, AgentContext } from '../AgentRunner'
import { logger } from '../logger'
import { eventBus } from './event-bus'
import type { WebContents } from 'electron'

const parameters = z.object({
  agent: z
    .enum(['explore', 'verify'])
    .describe(
      'The subagent to spawn: explore (read-only investigation) or verify (quick validation)'
    ),
  prompt: z.string().describe('Clear description of what the subagent should accomplish'),
  hostId: z.string().optional().describe('Host ID to scope the subagent to (optional)')
})

export default define('task', {
  description:
    '将任务委派给专用子代理。explore（只读调查，用于了解主机状态、搜索信息）或 verify（快速验证，确认命令结果或服务状态）。子代理在独立会话中运行，完成后将结果和资源消耗返回给主代理。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { agent: agentName, prompt, hostId } = args
    const config = getAgentConfig(agentName)

    if (config.mode === 'primary') {
      return { output: `Error: Cannot spawn "${agentName}" as a subagent — it is a primary agent.` }
    }

    const subagentSessionId = `sub_${agentName}_${uuidv4().slice(0, 8)}`

    logger.info('TaskTool', `Spawning subagent "${agentName}" in isolated session`, {
      sessionId: subagentSessionId,
      prompt: prompt.slice(0, 100)
    })

    try {
      const childContext: AgentContext = {
        topicId: ctx.topicId,
        taskId: subagentSessionId,
        stepId: undefined,
        webContents: ctx.webContents as WebContents,
        agentService: ctx.agentService as IAgentService,
        ensureSession: ctx.ensureSession,
        requestAuthorization: ctx.requestAuthorization,
        notifyStep: ctx.notifyStep,
        metadata: ctx.metadata,
        agentName
      }

      const scopedPrompt = hostId ? `Focus on host ${hostId}. ${prompt}` : prompt

      const messages = [
        {
          id: `subagent_${subagentSessionId}`,
          topicId: ctx.topicId,
          role: 'user' as const,
          content: scopedPrompt,
          timestamp: Date.now()
        }
      ]

      const runner = new AgentRunner(childContext, agentName)
      const result = await runner.run(messages)

      const childUsage = runner.getSessionUsage()
      if (childUsage.totalTokens > 0) {
        logger.info('TaskTool', `Subagent "${agentName}" cost aggregation`, {
          sessionId: subagentSessionId,
          inputTokens: childUsage.totalInputTokens,
          outputTokens: childUsage.totalOutputTokens,
          totalTokens: childUsage.totalTokens,
          llmCalls: childUsage.llmCalls
        })

        eventBus.publish('agent:subagent-complete', {
          topicId: ctx.topicId,
          taskId: ctx.taskId,
          subagentSessionId,
          subagentType: agentName,
          inputTokens: childUsage.totalInputTokens,
          outputTokens: childUsage.totalOutputTokens,
          totalTokens: childUsage.totalTokens,
          llmCalls: childUsage.llmCalls
        })
      }

      return {
        output: result.content || 'Subagent completed with no output',
        title: `${agentName} agent result`,
        metadata: {
          subagent: agentName,
          hostId,
          sessionId: subagentSessionId,
          usage: childUsage
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('TaskTool', `Subagent "${agentName}" failed`, error)
      return { output: `Error: Subagent "${agentName}" failed — ${msg}` }
    }
  }
})
