import type { WebContents } from 'electron'
import type { TerminalSession, TerminalSessionRole } from '../../shared/types'

export type CreateAgentSessionFn = (
  hostId: string,
  webContents: WebContents,
  topicId?: string,
  role?: TerminalSessionRole,
  existingSessionId?: string
) => Promise<string>

export interface AgentSession extends TerminalSession {
  paused: boolean
}
