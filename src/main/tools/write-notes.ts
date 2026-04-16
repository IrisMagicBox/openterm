import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { hostDB, terminalSessionDB } from '../db'

const parameters = z.object({
  target: z.enum(['host', 'terminal']).describe('要写入备注的目标类型'),
  targetId: z.string().describe('目标ID（主机ID或终端ID）'),
  notes: z.string().describe('备注内容，自由格式文本'),
  append: z.boolean().optional().describe('是否追加到现有备注，默认 false（覆盖）')
})

export default define('write_notes', {
  description:
    '写入或更新主机或终端的 Agent 备注。当你发现新信息、记录任务进度或需要记住重要事项时调用此工具。',
  parameters,
  async execute(args: z.infer<typeof parameters>, _ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const timestamp = new Date().toLocaleString()

    if (args.target === 'host') {
      const host = hostDB.getHostById(args.targetId)
      if (!host) {
        return { output: '主机不存在' }
      }
      const noteWithTime = `[${timestamp}]\n${args.notes}`
      const newNotes = args.append
        ? `${host.agentNotes || ''}\n\n---\n${noteWithTime}`
        : noteWithTime
      hostDB.updateAgentNotes(args.targetId, newNotes)
      return { output: '主机备注已更新' }
    } else {
      const session = terminalSessionDB.getSessionById(args.targetId)
      if (!session) {
        return { output: '终端不存在' }
      }
      const noteWithTime = `[${timestamp}]\n${args.notes}`
      const newNotes = args.append
        ? `${session.agentNotes || ''}\n\n---\n${noteWithTime}`
        : noteWithTime
      terminalSessionDB.updateAgentNotes(args.targetId, newNotes)
      return { output: '终端备注已更新' }
    }
  }
})
