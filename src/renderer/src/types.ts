import { Host } from '../../shared/types'

export type View = 'hosts' | 'terminal' | 'chat' | 'settings' | 'files'

export interface TerminalTab {
  host: Host
  sessionId: string
}
