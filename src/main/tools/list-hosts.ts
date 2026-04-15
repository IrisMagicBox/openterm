import { z } from 'zod'
import { define, Tool } from './tool-factory'
import type { Host } from '../../shared/types'

const parameters = z.object({})

export default define('list_hosts', {
  description:
    '列出当前 Topic 下的所有可用主机。当你需要确认可用主机或不确定主机ID时，主动调用此工具。',
  parameters,
  async execute(_args: z.infer<typeof parameters>, ctx: Tool.Context): Promise<Tool.ExecuteResult> {
    const hosts = await ctx.agentService.getTopicHosts(ctx.topicId)
    const filtered = hosts.filter((h): h is Host => h !== undefined)
    return { output: JSON.stringify(filtered) }
  }
})
