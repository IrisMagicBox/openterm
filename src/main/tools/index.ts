import { ToolRegistry } from './tool-registry'

import executeCommandTool from './execute-command'
import readFileTool from './read-file'
import writeFileTool from './write-file'
import listHostsTool from './list-hosts'
import manageTerminalTool from './manage-terminal'
import managePortForwardTool from './manage-port-forward'
import listTerminalsTool from './list-terminals'
import {
  interactTerminalTool,
  observeTerminalTool,
  sendTerminalKeysTool,
  startInteractiveCommandTool,
  waitTerminalActivityTool,
  waitTerminalTextTool
} from './terminal-automation'
import manageHostTool from './manage-host'
import searchMemoryTool from './search-memory'
import searchTopicsTool from './search-topics'
import readNotesTool from './read-notes'
import writeNotesTool from './write-notes'
import createArtifactTool from './create-artifact'
import searchTerminalHistoryTool from './search-terminal-history'
import getDeletedTerminalsTool from './get-deleted-terminals'
import grepTool from './grep'
import globTool from './glob'
import editTool from './edit'
import lsTool from './ls'
import lspTool from './lsp'
import websearchTool from './websearch'
import webfetchTool from './webfetch'
import updatePlanTool from './update-plan'
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
  registry.register(managePortForwardTool)
  registry.register(listTerminalsTool)
  registry.register(observeTerminalTool)
  registry.register(startInteractiveCommandTool)
  registry.register(interactTerminalTool)
  registry.register(sendTerminalKeysTool)
  registry.register(waitTerminalActivityTool)
  registry.register(waitTerminalTextTool)
  registry.register(manageHostTool)
  registry.register(searchMemoryTool)
  registry.register(searchTopicsTool)
  registry.register(readNotesTool)
  registry.register(writeNotesTool)
  registry.register(createArtifactTool)
  registry.register(searchTerminalHistoryTool)
  registry.register(getDeletedTerminalsTool)
  registry.register(grepTool)
  registry.register(globTool)
  registry.register(editTool)
  registry.register(lsTool)
  registry.register(lspTool)
  registry.register(websearchTool)
  registry.register(webfetchTool)
  registry.register(updatePlanTool)
  registry.register(taskTool)
  return registry
}
