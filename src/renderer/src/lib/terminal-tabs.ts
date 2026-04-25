import type { Host, TerminalSession } from '../../../shared/types'
import { WORKSPACE_TERMINALS_TOPIC_ID } from '../../../shared/constants'
import { LOCAL_HOST } from '../constants'
import type { TerminalTab } from '../types'

export function shouldMirrorSessionInTerminalTabs(session: TerminalSession): boolean {
  return (
    session.topicId === WORKSPACE_TERMINALS_TOPIC_ID &&
    (session.role ?? 'agent_command') !== 'agent_command' &&
    session.visible !== false
  )
}

export function terminalTabFromSession(session: TerminalSession, hosts: Host[]): TerminalTab {
  const knownHost =
    session.hostId === LOCAL_HOST.id
      ? LOCAL_HOST
      : (hosts.find((host) => host.id === session.hostId) ?? fallbackHostFromSession(session))

  return {
    host: knownHost,
    sessionId: session.id,
    title: session.name
  }
}

export function upsertTerminalTab(tabs: TerminalTab[], tab: TerminalTab): TerminalTab[] {
  const existingIndex = tabs.findIndex((existing) => existing.sessionId === tab.sessionId)
  if (existingIndex === -1) return [...tabs, tab]

  return tabs.map((existing, index) =>
    index === existingIndex
      ? {
          ...existing,
          ...tab
        }
      : existing
  )
}

function fallbackHostFromSession(session: TerminalSession): Host {
  return {
    id: session.hostId,
    alias: session.hostAlias || session.hostId,
    ip: session.hostAlias || session.hostId,
    port: 0,
    username: '',
    tags: [],
    createdAt: session.createdAt
  }
}
