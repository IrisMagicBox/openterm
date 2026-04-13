import type { ToolDefinition, ToolHandler, ToolContext, ToolResult } from './types'

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>()

  register(tool: ToolHandler): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`)
    }
    this.tools.set(tool.name, tool)
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name)
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult | string> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`)
    }
    return tool.execute(args, context)
  }
}
