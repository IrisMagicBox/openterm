import { getAIClient, getCurrentModel } from './ai'
import { logger } from './logger'
import { taskDB, taskStepDB, memoryDB, topicDB, hostDB } from './db'
import { getErrorMessage } from '../shared/errors'
import {
  DISTILLATION_THRESHOLD,
  DISTILLATION_MAX_LENGTH,
  REFLECTION_STEPS_LIMIT,
  REFLECTION_STEP_CONTENT_MAX
} from './constants'

export class MemoryManager {
  /**
   * Distills large terminal output into a concise summary to save context and focus the Agent.
   */
  static async distillObservation(
    command: string,
    output: string,
    exitCode: number
  ): Promise<string> {
    if (!output.trim()) return `命令 "${command}" 已执行，退出代码 ${exitCode}（无输出）。`

    // If output is short enough, just return it
    if (output.length < DISTILLATION_THRESHOLD && !output.includes('\x1b')) {
      return output
    }

    try {
      const aiClient = getAIClient()
      const model = getCurrentModel()

      logger.info('MemoryManager', `正在提纯命令输出: ${command.slice(0, 30)}...`)

      const response = await aiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是一位资深的 Linux 管理员。你的任务是将原始终端输出提纯为 1-3 句简洁的观察结论。重点关注关键事实：是否成功？具体的系统状态发生了什么变化？是否有错误？剔除所有 ANSI 颜色代码和冗余的日志。'
          },
          {
            role: 'user',
            content: `命令: ${command}\n退出代码: ${exitCode}\n\n原始输出:\n${output.slice(0, DISTILLATION_MAX_LENGTH)}`
          }
        ]
      })

      const summary = response.choices[0].message.content?.trim() || '命令已执行，但提纯失败。'
      return `[提纯后的观察结论]: ${summary}`
    } catch (err) {
      logger.error('MemoryManager', '提纯失败', err)
      return `[原始输出 (已截断)]: ${output.slice(0, DISTILLATION_THRESHOLD)}...`
    }
  }

  /**
   * Performs an autonomous reflection pass after a task completes to store long-term memories.
   */
  static async reflectOnTask(taskId: string): Promise<void> {
    const task = taskDB.getTaskById(taskId)
    if (!task || task.status !== 'completed') return

    const steps = taskStepDB.getTaskSteps(taskId)

    try {
      const aiClient = getAIClient()
      const model = getCurrentModel()

      logger.info('MemoryManager', `正在对任务 ${taskId} 进行回顾并提取记忆...`)

      // Limit the number of steps and content size to avoid context overflow (400 error)
      const truncatedSteps = steps
        .slice(-REFLECTION_STEPS_LIMIT)
        .map(
          (s) =>
            `- ${s.title}: ${s.content.slice(0, REFLECTION_STEP_CONTENT_MAX)}${s.content.length > REFLECTION_STEP_CONTENT_MAX ? '...' : ''}`
        )
        .join('\n')

      const response = await aiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `你是一位 Agent 经验记录员。你的任务是分析已完成的 SSH 任务并提取有价值的“全局经验”。
必须返回标准的 JSON 格式，包含 "memories" 数组。
关注点：
1. 主机事实：关于发现的 OS、环境或已安装软件的具体细节。
2. 用户习惯：用户展示出的偏好（例如：特定的 flag、首选工具）。
3. 经验教训：从错误或成功的命令链中获得的启示。

示例：
{
  "memories": [
    {"type": "host_fact", "content": "主机使用 Ubuntu 22.04", "importance": 4},
    {"type": "user_preference", "content": "用户偏好使用 htop 观察负载", "importance": 3}
  ]
}`
          },
          {
            role: 'user',
            content: `目标: ${task.goal}\n结论: ${task.summary || '无'}\n近期执行步骤:\n${truncatedSteps}`
          }
        ]
        // Removed response_format: { type: 'json_object' } to improve compatibility with non-GPT4 providers
      })

      let raw = response.choices[0].message.content || '{}'

      // Basic JSON cleaning in case the model returns markdown code blocks
      if (raw.trim().startsWith('```json')) {
        raw = raw.replace(/```json\n?/, '').replace(/```\n?$/, '')
      } else if (raw.trim().startsWith('```')) {
        raw = raw.replace(/```\n?/, '').replace(/```\n?$/, '')
      }

      const data = JSON.parse(raw)
      const entries = data.memories || []
      const hostId = steps.find((s) => s.hostId && s.hostId !== 'undefined')?.hostId

      for (const entry of entries) {
        // Double check host existence if we have a hostId to avoid FK errors
        let finalHostId = hostId
        if (finalHostId) {
          try {
            const h = hostDB.getHostById(finalHostId)
            if (!h) finalHostId = undefined
          } catch {
            finalHostId = undefined
          }
        }

        memoryDB.createMemory({
          type: entry.type,
          content: entry.content,
          importance: entry.importance || 3,
          hostId: finalHostId,
          topicId: task.topicId
        })
      }

      logger.info('MemoryManager', `成功从任务 ${taskId} 中提取了 ${entries.length} 条记忆`)
    } catch (err: unknown) {
      logger.error('MemoryManager', '回顾环节失败', {
        message: getErrorMessage(err),
        taskId
      })
    }
  }

  /**
   * Recalls layered memory context (Topic, Host, Global) to inject into the Agent's system prompt.
   */
  static async recallRelevantContext(topicId: string, query: string): Promise<string> {
    const topic = topicDB.getTopicById(topicId)
    const hostId = topic?.hostIds[0]

    // 1. Topic-specific context (memories linked to this topic)
    const topicMemories = topicId ? memoryDB.searchMemories(query, { topicId }) : []

    // 2. Host-specific facts (memories linked to the primary host)
    const hostMemories = hostId
      ? memoryDB.searchMemories('', { hostId }).filter((m) => m.type === 'host_fact')
      : []

    // 3. Global habits and experiences (relevant to the query but not tied to a specific topic/host)
    const globalMemories = memoryDB
      .searchRelevantMemories(query)
      .filter((m) => !m.topicId && !m.hostId)

    if (topicMemories.length === 0 && hostMemories.length === 0 && globalMemories.length === 0) {
      return ''
    }

    let context = '\n### 记忆与背景知识 (Layered Context):\n'

    if (topicMemories.length > 0) {
      context += `\n[当前话题记忆]:\n` + topicMemories.map((m) => `- ${m.content}`).join('\n')
    }

    if (hostMemories.length > 0) {
      context += `\n[目标主机事实]:\n` + hostMemories.map((m) => `- ${m.content}`).join('\n')
    }

    if (globalMemories.length > 0) {
      context +=
        `\n[全局习惯与经验]:\n` +
        globalMemories.map((m) => `- [${m.type.toUpperCase()}] ${m.content}`).join('\n')
    }

    return context
  }
}
