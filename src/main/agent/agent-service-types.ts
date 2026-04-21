import type { WebContents } from 'electron'
import type { TerminalSession } from '../../shared/types'

export type CreateAgentSessionFn = (
  hostId: string,
  webContents: WebContents,
  topicId?: string
) => Promise<string>

export interface AgentSession extends TerminalSession {
  paused: boolean
}
