import { z } from 'zod'
import { define, Tool } from './tool-factory'
import { hostDB, terminalSessionDB } from '../db'

const parameters = z.object({
  target: z.enum(['host', 'terminal']).describe('要读取备注的目标类型'),
  targetId: z.string().describe('目标ID（主机ID或终端ID）')
})

export default define('read_notes', {
  description:
    '读取主机或终端的 Agent 备注。当你需要了解某个主机或终端的历史记录、用途说明、当前状态时调用此工具。',
  parameters,
  async execute(args: z.infer<typeof parameters>, _ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    if (args.target === 'host') {
      const host = hostDB.getHostById(args.targetId)
      if (!host) {
        return { output: '主机不存在' }
      }
      return {
        output: host.agentNotes || '暂无备注'
      }
    } else {
      const session = terminalSessionDB.getSessionById(args.targetId)
      if (!session) {
        return { output: '终端不存在' }
      }
      return {
        output: session.agentNotes || '暂无备注'
      }
    }
  }
})
