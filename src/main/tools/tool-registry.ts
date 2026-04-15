import type { Tool } from './tool-factory'
import type { ToolDefinition } from './types'
import { getAgentConfig } from '../agent/agent-config'

export class ToolRegistry {
  private tools = new Map<string, Tool.Info>()

  register(tool: Tool.Info): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`)
    }
    this.tools.set(tool.id, tool)
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  /**
   * Returns tool definitions filtered by the given agent's allowedTools config.
   * If the agent's allowedTools is empty, all tools are returned.
   */
  getFilteredDefinitions(agentName: string): ToolDefinition[] {
    const config = getAgentConfig(agentName)
    if (config.allowedTools.length === 0) {
      return this.getDefinitions()
    }
    return Array.from(this.tools.values())
      .filter((t) => config.allowedTools.includes(t.id))
      .map((t) => t.definition)
  }

  get(name: string): Tool.Info | undefined {
    return this.tools.get(name)
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: Tool.Context
  ): Promise<Tool.ExecuteResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { output: `Error: Unknown tool "${name}". Please use one of the available tools.` }
    }
    return tool.execute(args, context)
  }
}
