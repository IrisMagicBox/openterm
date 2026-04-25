import type { WebContents } from 'electron'
import type {
  TerminalSession,
  TerminalSessionDeletedBy,
  TerminalSessionRole
} from '../../shared/types'

export type CreateAgentSessionFn = (
  hostId: string,
  webContents: WebContents,
  topicId?: string,
  role?: TerminalSessionRole,
  existingSessionId?: string
) => Promise<string>

export type CloseTerminalSessionFn = (
  session: Pick<TerminalSession, 'id' | 'hostId'>,
  deletedBy?: TerminalSessionDeletedBy
) => boolean | void

export interface AgentSession extends TerminalSession {
  paused: boolean
}
