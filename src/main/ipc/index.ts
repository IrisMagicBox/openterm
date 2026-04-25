import { registerHostIPC } from './hosts'
import { registerTopicIPC } from './topics'
import { registerTaskIPC } from './tasks'
import { registerTaskStepIPC } from './task-steps'
import { registerApprovalIPC } from './approvals'
import { registerArtifactIPC } from './artifacts'
import { registerModelIPC } from './models'
import { registerProviderIPC } from './providers'
import { registerSettingsIPC } from './settings'
import { registerSearchIPC } from './search'
import { registerSessionIPC } from './session'
import { registerMessageIPC } from './messages'
import { registerAgentRunIPC } from './agent-runs'
import { registerMemoryIPC } from './memories'
import { registerTerminalCommandAssistIPC } from './terminal-command-assist'

export function registerAllIPC(): void {
  registerHostIPC()
  registerTopicIPC()
  registerTaskIPC()
  registerTaskStepIPC()
  registerApprovalIPC()
  registerArtifactIPC()
  registerModelIPC()
  registerProviderIPC()
  registerSettingsIPC()
  registerSearchIPC()
  registerSessionIPC()
  registerMessageIPC()
  registerAgentRunIPC()
  registerMemoryIPC()
  registerTerminalCommandAssistIPC()
}
