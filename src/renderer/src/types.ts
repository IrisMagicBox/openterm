import { Host } from '../../shared/types'

export type View = 'hosts' | 'terminal' | 'chat' | 'settings' | 'files'

export interface TerminalTab {
  host: Host
  sessionId: string
  title?: string
}

export interface WorkspaceWindowItem {
  id: string
  title: string
  subtitle: string
}
