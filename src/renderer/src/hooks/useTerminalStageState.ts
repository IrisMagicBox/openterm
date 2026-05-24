import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentPart, TerminalSession } from '../../../shared/types'
import {
  agentPartSessionId,
  pickRunningAgentPart,
  resolveFocusedSessionId,
  type TerminalStageMode
} from '../lib/terminal-stage'

const MODE_STORAGE_KEY = 'openterm.terminalStage.mode'

export interface TerminalFocusOptions {
  userInitiated?: boolean
  partId?: string | null
}

function initialMode(): TerminalStageMode {
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY)
  if (stored === 'stage' || stored === 'grid') return stored
  if (stored === 'timeline') window.localStorage.setItem(MODE_STORAGE_KEY, 'stage')
  return 'stage'
}

export function useTerminalStageState(
  visibleSessions: TerminalSession[],
  activeParts: AgentPart[]
) {
  const [mode, setModeState] = useState<TerminalStageMode>(initialMode)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [focusedPartId, setFocusedPartId] = useState<string | null>(null)
  const [followAgent, setFollowAgentState] = useState(true)
  const followAgentRef = useRef(true)

  const focusedSession = useMemo(
    () => visibleSessions.find((session) => session.id === focusedSessionId),
    [visibleSessions, focusedSessionId]
  )

  const setMode = useCallback((nextMode: TerminalStageMode) => {
    setModeState(nextMode)
    window.localStorage.setItem(MODE_STORAGE_KEY, nextMode)
  }, [])

  useEffect(() => {
    setFocusedSessionId((current) =>
      resolveFocusedSessionId({
        sessions: visibleSessions,
        activeParts,
        currentFocusedSessionId: current,
        followAgent: followAgent && followAgentRef.current
      })
    )
  }, [visibleSessions, activeParts, followAgent])

  useEffect(() => {
    if (!followAgent || !followAgentRef.current) return

    const runningPart = pickRunningAgentPart(visibleSessions, activeParts)
    const sessionId = runningPart ? agentPartSessionId(runningPart) : undefined
    if (!runningPart || !sessionId) return

    setFocusedSessionId(sessionId)
    setFocusedPartId(runningPart.id)
  }, [visibleSessions, activeParts, followAgent])

  const setFollowAgent = useCallback(
    (nextFollowAgent: boolean) => {
      followAgentRef.current = nextFollowAgent
      setFollowAgentState(nextFollowAgent)
      if (!nextFollowAgent) return

      const focusedId = resolveFocusedSessionId({
        sessions: visibleSessions,
        activeParts,
        currentFocusedSessionId: focusedSessionId,
        followAgent: true
      })
      if (focusedId) setFocusedSessionId(focusedId)

      const runningPart = pickRunningAgentPart(visibleSessions, activeParts)
      if (runningPart) setFocusedPartId(runningPart.id)
    },
    [activeParts, focusedSessionId, visibleSessions]
  )

  const focusSession = useCallback(
    (sessionId: string, options: TerminalFocusOptions = {}) => {
      if (!visibleSessions.some((session) => session.id === sessionId)) return

      if (options.userInitiated) {
        followAgentRef.current = false
      }
      setFocusedSessionId(sessionId)
      if (options.userInitiated) setFollowAgentState(false)
      if ('partId' in options) setFocusedPartId(options.partId || null)
    },
    [visibleSessions]
  )

  const revealTerminal = useCallback(
    (sessionId: string, partId?: string) => {
      focusSession(sessionId, { partId: partId || null })
    },
    [focusSession]
  )

  return {
    mode,
    focusedSessionId,
    focusedSession,
    focusedPartId,
    followAgent,
    setMode,
    setFollowAgent,
    focusSession,
    revealTerminal
  }
}
