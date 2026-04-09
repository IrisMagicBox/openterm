import { getAIClient, getCurrentModel } from './ai'
import { logger } from './logger'
import { taskDB, taskStepDB, memoryDB, topicDB } from './db'

export class MemoryManager {
  /**
   * Distills large terminal output into a concise summary to save context and focus the Agent.
   */
  static async distillObservation(command: string, output: string, exitCode: number): Promise<string> {
    if (!output.trim()) return `命令 "${command}" 已执行，退出代码 ${exitCode}（无输出）。`
    
    // If output is short enough, just return it
    if (output.length < 500 && !output.includes('\x1b')) {
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
            content: '你是一位资深的 Linux 管理员。你的任务是将原始终端输出提纯为 1-3 句简洁的观察结论。重点关注关键事实：是否成功？具体的系统状态发生了什么变化？是否有错误？剔除所有 ANSI 颜色代码和冗余的日志。'
          },
          {
            role: 'user',
            content: `命令: ${command}\n退出代码: ${exitCode}\n\n原始输出:\n${output.slice(0, 5000)}` 
          }
        ]
      })

      const summary = response.choices[0].message.content?.trim() || '命令已执行，但提纯失败。'
      return `[提纯后的观察结论]: ${summary}`
    } catch (err) {
      logger.error('MemoryManager', '提纯失败', err)
      return `[原始输出 (已截断)]: ${output.slice(0, 500)}...`
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

      const response = await aiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `你是一位 Agent 经验记录员。你的任务是分析已完成的 SSH 任务并提取有价值的“全局经验”。
关注点：
1. 主机事实：关于发现的 OS、环境或已安装软件的具体细节。
2. 用户习惯：用户展示出的偏好（例如：特定的 flag、首选工具）。
3. 经验教训：从错误或成功的命令链中获得的启示。

返回一个包含 "memories" 数组的 JSON 对象。
示例：{"memories": [{"type": "host_fact", "content": "主机使用 Ubuntu 22.04", "importance": 4}]}`
          },
          {
            role: 'user',
            content: `目标: ${task.goal}\n总结: ${task.summary}\n步骤:\n${steps.map(s => `- ${s.title}: ${s.content}`).join('\n')}`
          }
        ],
        response_format: { type: 'json_object' }
      })

      const raw = response.choices[0].message.content || '{}'
      const data = JSON.parse(raw)
      const entries = data.memories || []

      for (const entry of entries) {
        memoryDB.createMemory({
          type: entry.type,
          content: entry.content,
          importance: entry.importance || 3,
          hostId: steps.find(s => s.hostId)?.hostId,
          topicId: task.topicId
        })
      }
      
      logger.info('MemoryManager', `成功从任务 ${taskId} 中提取了 ${entries.length} 条记忆`)
    } catch (err) {
      logger.error('MemoryManager', '回顾环节失败', err)
    }
  }

  /**
   * Recalls relevant global memories to inject into the Agent's system prompt.
   */
  static async recallRelevantContext(topicId: string, query: string): Promise<string> {
    const topic = topicDB.getTopicById(topicId)
    const hostId = topic?.hostIds[0] 

    const memories = memoryDB.searchRelevantMemories(query, hostId)
    if (memories.length === 0) return ''

    return `\n### 全局经验与用户习惯：\n` + 
      memories.map(m => `- [${m.type.toUpperCase()}] ${m.content}`).join('\n')
  }
}
