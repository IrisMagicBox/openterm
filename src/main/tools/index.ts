import { ToolRegistry } from './tool-registry'

import executeCommandHandler from './execute-command'
import readFileHandler from './read-file'
import writeFileHandler from './write-file'
import listHostsHandler from './list-hosts'
import manageTerminalHandler from './manage-terminal'
import listTerminalsHandler from './list-terminals'
import manageHostHandler from './manage-host'
import searchMemoryHandler from './search-memory'
import searchTopicsHandler from './search-topics'

export { ToolRegistry } from './tool-registry'
export type { ToolHandler, ToolDefinition, ToolContext } from './types'

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(executeCommandHandler)
  registry.register(readFileHandler)
  registry.register(writeFileHandler)
  registry.register(listHostsHandler)
  registry.register(manageTerminalHandler)
  registry.register(listTerminalsHandler)
  registry.register(manageHostHandler)
  registry.register(searchMemoryHandler)
  registry.register(searchTopicsHandler)
  return registry
}
