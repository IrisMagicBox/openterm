import { ToolRegistry } from './tool-registry'

import executeCommandTool from './execute-command'
import readFileTool from './read-file'
import writeFileTool from './write-file'
import listHostsTool from './list-hosts'
import manageTerminalTool from './manage-terminal'
import listTerminalsTool from './list-terminals'
import manageHostTool from './manage-host'
import searchMemoryTool from './search-memory'
import searchTopicsTool from './search-topics'
import taskTool from '../agent/task-tool'

export { ToolRegistry } from './tool-registry'
export { define } from './tool-factory'
export type { Tool } from './tool-factory'
export type { ToolDefinition } from './types'
/** @deprecated Use Tool.Info, Tool.Context, Tool.ExecuteResult from './tool-factory' */
export type { ToolHandler, ToolContext, ToolResult } from './types'

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(executeCommandTool)
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(listHostsTool)
  registry.register(manageTerminalTool)
  registry.register(listTerminalsTool)
  registry.register(manageHostTool)
  registry.register(searchMemoryTool)
  registry.register(searchTopicsTool)
  registry.register(taskTool)
  return registry
}
