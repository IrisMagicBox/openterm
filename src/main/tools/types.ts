import type { AuthResponse } from '../AgentRunner'

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

/** @deprecated Use Tool.Info from './tool-factory' instead */
export interface ToolHandler {
  name: string
  definition: ToolDefinition
  execute(args: Record<string, unknown>, context: Record<string, unknown>): Promise<unknown>
}

/** @deprecated Use Tool.Context from './tool-factory' instead */
export type ToolContext = Record<string, unknown>

/** @deprecated Use Tool.ExecuteResult from './tool-factory' instead */
export type ToolResult = string | Record<string, unknown> | Record<string, unknown>[]

export type { AuthResponse }
