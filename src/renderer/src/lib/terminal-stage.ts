import type { AgentPart, TerminalSession } from '../../../shared/types'

export type TerminalStageMode = 'stage' | 'grid'

export type TerminalActivityStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused'

export interface TerminalPreview {
  sessionId: string
  lastLine: string
  updatedAt: number
}

export interface TerminalActivity {
  sessionId: string
  hostAlias: string
  name?: string
  status: TerminalActivityStatus
  command?: string
  lastLine?: string
  exitCode?: number
  durationMs?: number
  updatedAt: number
  partId?: string
  toolName?: string
}

export function agentPartSessionId(part: AgentPart): string | undefined {
  if (typeof part.sessionId === 'string' && part.sessionId.trim()) return part.sessionId

  const metadataSessionId = part.metadata?.sessionId
  if (typeof metadataSessionId === 'string' && metadataSessionId.trim()) return metadataSessionId

  return undefined
}

export function parseAgentPartCommand(part: AgentPart): string | undefined {
  if (!part.input) return undefined

  try {
    const parsed = JSON.parse(part.input) as Record<string, unknown>
    const candidates = [parsed.command, parsed.cmd, parsed.path, parsed.description]
    const match = candidates.find((value) => typeof value === 'string' && value.trim())
    if (typeof match === 'string') return match
    return JSON.stringify(parsed)
  } catch {
    return part.input
  }
}

function isRunningPart(part: AgentPart): boolean {
  return part.status === 'running' || part.status === 'pending'
}

function newestPart(parts: AgentPart[]): AgentPart | undefined {
  return [...parts].sort((a, b) => {
    const byUpdated = (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    return byUpdated || b.orderIndex - a.orderIndex
  })[0]
}

function partTime(part: AgentPart): number {
  return part.updatedAt || part.startedAt || part.createdAt
}

function statusPriority(status: TerminalActivityStatus): number {
  if (status === 'running') return 0
  if (status === 'failed') return 1
  if (status === 'paused') return 3
  if (status === 'completed') return 4
  return 5
}

export function deriveTerminalActivities(
  sessions: TerminalSession[],
  activeParts: AgentPart[],
  previews: Record<string, TerminalPreview>,
  now = Date.now()
): TerminalActivity[] {
  const partsBySession = new Map<string, AgentPart[]>()

  activeParts.forEach((part) => {
    const sessionId = agentPartSessionId(part)
    if (!sessionId || part.type === 'usage') return
    const existing = partsBySession.get(sessionId) || []
    existing.push(part)
    partsBySession.set(sessionId, existing)
  })

  return sessions.map((session) => {
    const sessionParts = partsBySession.get(session.id) || []
    const runningPart = newestPart(sessionParts.filter(isRunningPart))
    const latestPart = runningPart || newestPart(sessionParts)
    const preview = previews[session.id]

    let status: TerminalActivityStatus = 'idle'
    if (session.commandStatus === 'running' || runningPart) status = 'running'
    else if (session.paused) status = 'paused'
    else if (session.commandStatus === 'failed' || latestPart?.status === 'error') status = 'failed'
    else if (session.commandStatus === 'completed' || latestPart?.status === 'completed') {
      status = 'completed'
    }

    const command = session.command || (latestPart ? parseAgentPartCommand(latestPart) : undefined)
    const updatedAt = Math.max(
      session.commandStartTime || 0,
      latestPart ? partTime(latestPart) : 0,
      preview?.updatedAt || 0,
      session.createdAt
    )

    return {
      sessionId: session.id,
      hostAlias: session.hostAlias,
      name: session.name,
      status,
      command,
      lastLine: preview?.lastLine,
      exitCode: session.commandExitCode,
      durationMs:
        status === 'running' && session.commandStartTime
          ? now - session.commandStartTime
          : session.commandDurationMs,
      updatedAt,
      partId: latestPart?.id,
      toolName: latestPart?.toolName
    }
  })
}

export function sortTerminalActivities(activities: TerminalActivity[]): TerminalActivity[] {
  return [...activities].sort((a, b) => {
    return (
      statusPriority(a.status) - statusPriority(b.status) ||
      b.updatedAt - a.updatedAt ||
      a.hostAlias.localeCompare(b.hostAlias)
    )
  })
}

export function pickRunningAgentPart(
  sessions: TerminalSession[],
  activeParts: AgentPart[]
): AgentPart | undefined {
  const sessionIds = new Set(sessions.map((session) => session.id))
  return newestPart(
    activeParts.filter((part) => {
      const sessionId = agentPartSessionId(part)
      return !!sessionId && sessionIds.has(sessionId) && isRunningPart(part)
    })
  )
}

export function pickFollowAgentSession(
  sessions: TerminalSession[],
  activeParts: AgentPart[]
): string | undefined {
  const runningSession = [...sessions]
    .filter((session) => session.commandStatus === 'running')
    .sort((a, b) => (b.commandStartTime || b.createdAt) - (a.commandStartTime || a.createdAt))[0]

  const runningPart = pickRunningAgentPart(sessions, activeParts)
  const partSessionId = runningPart ? agentPartSessionId(runningPart) : undefined

  if (!runningSession) return partSessionId
  if (!runningPart) return runningSession.id

  const sessionTime = runningSession.commandStartTime || runningSession.createdAt
  return partTime(runningPart) >= sessionTime ? partSessionId : runningSession.id
}

export function resolveFocusedSessionId({
  sessions,
  activeParts,
  currentFocusedSessionId,
  followAgent
}: {
  sessions: TerminalSession[]
  activeParts: AgentPart[]
  currentFocusedSessionId: string | null
  followAgent: boolean
}): string | null {
  if (sessions.length === 0) return null

  if (followAgent) {
    const agentSessionId = pickFollowAgentSession(sessions, activeParts)
    if (agentSessionId) return agentSessionId
  }

  if (
    currentFocusedSessionId &&
    sessions.some((session) => session.id === currentFocusedSessionId)
  ) {
    return currentFocusedSessionId
  }

  return sessions[0].id
}
