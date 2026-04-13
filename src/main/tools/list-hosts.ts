import type { ToolHandler, ToolContext, ToolResult } from './types'
import type { Host } from '../../shared/types'

const listHostsHandler: ToolHandler = {
  name: 'list_hosts',
  definition: {
    type: 'function',
    function: {
      name: 'list_hosts',
      description:
        '列出当前 Topic 下的所有可用主机。当你需要确认可用主机或不确定主机ID时，主动调用此工具。',
      parameters: { type: 'object', properties: {} }
    }
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResult> {
    const hosts = await ctx.agentService.getTopicHosts(ctx.topicId)
    return hosts.filter((h): h is Host => h !== undefined) as unknown as Record<string, unknown>[]
  }
}

export default listHostsHandler
