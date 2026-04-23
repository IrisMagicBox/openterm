import type { WebContents } from 'electron'
import type { TerminalSession, TerminalSessionRole } from '../../shared/types'

export type CreateAgentSessionFn = (
  hostId: string,
  webContents: WebContents,
  topicId?: string,
  role?: TerminalSessionRole
) => Promise<string>

export interface AgentSession extends TerminalSession {
  paused: boolean
}
