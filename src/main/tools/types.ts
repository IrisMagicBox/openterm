import type { AgentContext, AuthResponse } from '../AgentRunner'

export type ToolContext = AgentContext

/** JSON Schema object describing tool parameters */
export type ToolParameters = Record<string, unknown>

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolParameters
  }
}

/** Result returned by a tool execution */
export type ToolResult = string | Record<string, unknown> | Record<string, unknown>[]

export interface ToolHandler {
  name: string
  definition: ToolDefinition
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult | string>
}

export type { AuthResponse }
