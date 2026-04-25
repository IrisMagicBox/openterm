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
    .enum(['plan', 'explore', 'verify'])
    .describe(
      'The subagent to spawn: plan (read-only planning), explore (read-only investigation), or verify (quick validation)'
    ),
  prompt: z.string().describe('Clear description of what the subagent should accomplish'),
  hostId: z.string().optional().describe('Host ID to scope the subagent to (optional)')
})

export default define('task', {
  description:
    '将任务委派给专用子代理。plan（只读规划，用于拆解复杂任务和风险评估）、explore（只读调查，用于了解主机状态、搜索信息）或 verify（快速验证，确认命令结果或服务状态）。子代理在独立会话中运行，完成后将结果和资源消耗返回给主代理。',
  parameters,
  async execute(args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const { agent: agentName, prompt, hostId } = args
    const config = getAgentConfig(agentName)

    if (config.mode === 'primary') {
      return { output: `Error: Cannot spawn "${agentName}" as a subagent — it is a primary agent.` }
    }

    const parentAgentConfig = getAgentConfig(ctx.agent)
    if (parentAgentConfig.mode !== 'primary') {
      return {
        output: `Error: Agent "${ctx.agent}" cannot spawn nested subagents.`
      }
    }

    const canSpawnSubagent = parentAgentConfig.permissions.some(
      (p) => (p.tool === '*' || p.tool === 'task') && p.allowed
    )

    if (!canSpawnSubagent) {
      return {
        output: `Error: Agent "${ctx.agent}" does not have permission to spawn subagents.`
      }
    }

    await ctx.ask({
      permission: 'task',
      pattern: agentName,
      metadata: { prompt: prompt.slice(0, 100) }
    })

    const subagentSessionId = `sub_${agentName}_${uuidv4().slice(0, 8)}`

    logger.info('TaskTool', `Spawning subagent "${agentName}" in isolated session`, {
      sessionId: subagentSessionId,
      prompt: prompt.slice(0, 100)
    })

    const scopedPrompt = hostId ? `Focus on host ${hostId}. ${prompt}` : prompt
    const childAbortController = new AbortController()
    const abortChild = (): void => childAbortController.abort()
    if (ctx.abort.aborted) {
      childAbortController.abort()
    } else {
      ctx.abort.addEventListener('abort', abortChild, { once: true })
    }
    let registeredController = false

    try {
      ctx.agentService.registerRunController(subagentSessionId, childAbortController)
      registeredController = true
      ctx.updatePartMetadata?.({
        childRunId: subagentSessionId,
        childAgent: agentName,
        hostId,
        originalPrompt: prompt
      })

      const childContext: AgentContext = {
        topicId: ctx.topicId,
        taskId: ctx.taskId,
        runId: subagentSessionId,
        parentRunId: ctx.runId,
        parentPartId: ctx.partId,
        stepId: undefined,
        webContents: ctx.webContents as WebContents,
        agentService: ctx.agentService as IAgentService,
        ensureSession: ctx.ensureSession,
        requestAuthorization: (cmd, risk, reason, metadata) => {
          const subagentConfig = getAgentConfig(agentName)
          const toolName =
            typeof metadata?.toolName === 'string' ? metadata.toolName : 'execute_command'
          const maxRisk = subagentConfig.permissions.find(
            (p) => p.tool === toolName || p.tool === '*'
          )?.maxAutoApproveRisk
          if (maxRisk) {
            const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 }
            if (riskLevels[risk] <= riskLevels[maxRisk]) {
              return Promise.resolve({ approved: true, alwaysAllow: false })
            }
          }
          return ctx.requestAuthorization(cmd, risk, `[Subagent ${agentName}] ${reason}`, metadata)
        },
        notifyStep: ctx.notifyStep,
        metadata: ctx.metadata,
        agentName,
        abort: childAbortController.signal
      }

      const messages = [
        {
          id: `subagent_${subagentSessionId}`,
          topicId: ctx.topicId,
          runId: subagentSessionId,
          role: 'user' as const,
          content: scopedPrompt,
          timestamp: Date.now()
        }
      ]

      const runner = new AgentRunner(childContext, agentName, {
        runId: subagentSessionId,
        parentRunId: ctx.runId,
        parentPartId: ctx.partId,
        persistFinalMessage: false,
        updateTaskStatus: false,
        goal: scopedPrompt,
        metadata: {
          originalPrompt: prompt,
          scopedPrompt,
          hostId,
          childAgent: agentName
        }
      })
      const result = await runner.run(messages)
      ctx.updatePartMetadata?.({ childRunId: childContext.runId, childAgent: agentName, hostId })

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
        output: JSON.stringify({
          task_id: childContext.runId ?? subagentSessionId,
          content: result.content || 'Subagent completed with no output'
        }),
        title: `${agentName} agent result`,
        metadata: {
          subagent: agentName,
          hostId,
          sessionId: childContext.runId ?? subagentSessionId,
          usage: childUsage
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('TaskTool', `Subagent "${agentName}" failed`, error)
      return { output: `Error: Subagent "${agentName}" failed — ${msg}` }
    } finally {
      ctx.abort.removeEventListener('abort', abortChild)
      if (registeredController) {
        ctx.agentService.unregisterRunController(subagentSessionId, childAbortController)
      }
    }
  }
})
