import type { Tool } from './tool-factory'
import type { ToolDefinition } from './types'
import { getAgentConfig } from '../agent/agent-config'
import { zodToJsonSchema } from './tool-factory'

export interface InitializedTool {
  id: string
  definition: ToolDefinition
  execute(
    args: Record<string, unknown>,
    ctx: Tool.Context
  ): Promise<{
    title?: string
    metadata?: Tool.Metadata
    output: string
  }>
}

export class ToolRegistry {
  private tools = new Map<string, Tool.Info>()
  private initializedTools = new Map<string, InitializedTool>()

  register(tool: Tool.Info): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`)
    }
    this.tools.set(tool.id, tool)
  }

  async initializeTools(agentName?: string): Promise<void> {
    for (const [id, toolInfo] of this.tools) {
      const initialized = await toolInfo.init({ agent: agentName })

      const definition: ToolDefinition = {
        type: 'function',
        function: {
          name: id,
          description: initialized.description,
          parameters: zodToJsonSchema(initialized.parameters)
        }
      }

      this.initializedTools.set(id, {
        id,
        definition,
        execute: initialized.execute
      })
    }
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.initializedTools.values()).map((t) => t.definition)
  }

  getFilteredDefinitions(agentName: string): ToolDefinition[] {
    const config = getAgentConfig(agentName)
    if (config.allowedTools.length === 0) {
      return this.getDefinitions()
    }
    return Array.from(this.initializedTools.values())
      .filter((t) => config.allowedTools.includes(t.id))
      .map((t) => t.definition)
  }

  get(name: string): InitializedTool | undefined {
    return this.initializedTools.get(name)
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: Tool.Context
  ): Promise<{ output: string; metadata?: Tool.Metadata }> {
    const tool = this.initializedTools.get(name)
    if (!tool) {
      return { output: `Error: Unknown tool "${name}". Please use one of the available tools.` }
    }
    const result = await tool.execute(args, context)
    return {
      output: result.output,
      metadata: result.metadata
    }
  }
}
