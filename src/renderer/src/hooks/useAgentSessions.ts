import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TerminalSession, Topic } from '../../../shared/types'

interface PendingAuth {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  metadata?: Record<string, unknown>
}

interface UseAgentSessionsResult {
  agentSessions: TerminalSession[]
  setAgentSessions: Dispatch<SetStateAction<TerminalSession[]>>
  thinkingTopics: Set<string>
  pendingAuth: PendingAuth | null
  setPendingAuth: Dispatch<SetStateAction<PendingAuth | null>>
  handleCreateTerminal: (hostId: string) => Promise<void>
  handleCloseTerminal: (id: string) => Promise<void>
  handleRenameTerminal: (id: string, name: string) => Promise<void>
  handleToggleTerminalPin: (id: string, isPinned: boolean) => Promise<void>
  handleToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  handleResolveAuth: (approved: boolean, alwaysAllow?: boolean) => Promise<void>
}

function normalizeSessionForState(session: TerminalSession): TerminalSession {
  return {
    ...session,
    visible: session.visible ?? session.role !== 'agent_command',
    paused: session.paused ?? false,
    takeoverMode: session.takeoverMode ?? null
  }
}

export function useAgentSessions({
  selectedTopic
}: {
  selectedTopic: Topic | null
}): UseAgentSessionsResult {
  const [agentSessions, setAgentSessions] = useState<TerminalSession[]>([])
  const [thinkingTopics, setThinkingTopics] = useState<Set<string>>(new Set())
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null)
  const agentSessionIds = agentSessions.map((session) => session.id).join(',')

  useEffect(() => {
    let cancelled = false
    const selectedTopicId = selectedTopic?.id

    const unlistenAuth = window.api.onAgentAuthRequest(
      (requestId, command, riskLevel, reason, metadata) =>
        setPendingAuth({ requestId, command, riskLevel, reason, metadata })
    )

    const unlistenThinking = window.api.onAgentThinking(({ topicId, thinking }) => {
      setThinkingTopics((prev) => {
        const next = new Set(prev)
        if (thinking) next.add(topicId)
        else next.delete(topicId)
        return next
      })
    })

    const unlistenTerminalShow = window.api.onAgentTerminalShow((data) => {
      if (selectedTopicId && data.topicId !== selectedTopicId) return
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.id === data.id)
        if (exists) {
          return prev.map((s) =>
            s.id === data.id
              ? {
                  ...s,
                  ...data,
                  visible: true,
                  paused: data.paused ?? s.paused ?? false,
                  takeoverMode: data.takeoverMode ?? s.takeoverMode ?? null
                }
              : s
          )
        }
        return [
          ...prev,
          {
            ...data,
            visible: true,
            paused: data.paused ?? false,
            takeoverMode: data.takeoverMode ?? null
          }
        ]
      })
    })

    const unlistenTerminalHide = window.api.onAgentTerminalHide(({ id }) => {
      setAgentSessions((prev) => prev.map((s) => (s.id === id ? { ...s, visible: false } : s)))
    })

    const unlistenSessionCreated = window.api.onAgentSessionCreated((data) => {
      if (selectedTopicId && data.topicId !== selectedTopicId) return
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.id === data.id)
        const nextSession = normalizeSessionForState(data)
        if (exists) return prev.map((s) => (s.id === data.id ? { ...s, ...nextSession } : s))
        return [...prev, nextSession]
      })
    })

    const unlistenSessionClosed = window.api.onAgentSessionClosed(({ id }) => {
      setAgentSessions((prev) => prev.filter((s) => s.id !== id))
    })

    if (selectedTopicId) {
      window.api
        .getAgentSessions(selectedTopicId)
        .then((sessions) => {
          if (cancelled) return
          setAgentSessions(sessions.map(normalizeSessionForState))
        })
        .catch(() => {
          if (!cancelled) setAgentSessions([])
        })
    } else {
      window.queueMicrotask(() => {
        if (!cancelled) setAgentSessions([])
      })
    }

    return () => {
      cancelled = true
      unlistenAuth()
      unlistenThinking()
      unlistenTerminalShow()
      unlistenTerminalHide()
      unlistenSessionCreated()
      unlistenSessionClosed()
    }
  }, [selectedTopic])

  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    agentSessionIds
      .split(',')
      .filter(Boolean)
      .forEach((sessionId) => {
        const unsubStart = window.api.onTerminalCommandStart(sessionId, (data) => {
          setAgentSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    command: data.command,
                    commandSource: data.source === 'user' ? 'user' : 'agent',
                    commandStatus: 'running',
                    commandStartTime: Date.now(),
                    commandExitCode: undefined,
                    commandDurationMs: undefined
                  }
                : s
            )
          )
        })

        const unsubEnd = window.api.onTerminalCommandEnd(sessionId, (data) => {
          setAgentSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    commandStatus: data.exitCode === 0 ? 'completed' : 'failed',
                    commandExitCode: data.exitCode,
                    commandDurationMs: data.durationMs
                  }
                : s
            )
          )
        })

        const unsubTakeover = window.api.onTerminalUserTakeover(sessionId, () => {
          setAgentSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    commandStatus:
                      s.commandStatus === 'running' || s.commandSource === 'agent'
                        ? 'failed'
                        : s.commandStatus,
                    commandSource:
                      s.commandStatus === 'running' || s.commandSource === 'agent'
                        ? 'user'
                        : s.commandSource
                  }
                : s
            )
          )
        })

        const unsubControlState = window.api.onTerminalControlState(sessionId, (state) => {
          setAgentSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    paused: state.paused,
                    lockedBy: state.lockedBy,
                    takeoverMode: state.takeoverMode
                  }
                : s
            )
          )
        })

        unsubscribers.push(unsubStart, unsubEnd, unsubTakeover, unsubControlState)
      })

    return () => {
      unsubscribers.forEach((fn) => fn())
    }
  }, [agentSessionIds])

  const handleCreateTerminal = useCallback(
    async (hostId: string) => {
      if (!selectedTopic) return
      await window.api.createAgentTerminal(selectedTopic.id, hostId)
    },
    [selectedTopic]
  )

  const handleCloseTerminal = useCallback(async (id: string) => {
    await window.api.closeAgentTerminal(id, 'user')
    setAgentSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleRenameTerminal = useCallback(async (id: string, name: string) => {
    await window.api.renameAgentTerminal(id, name)
    setAgentSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])

  const handleToggleTerminalPin = useCallback(async (id: string, isPinned: boolean) => {
    await window.api.toggleTerminalPin(id, isPinned)
    setAgentSessions((prev) => prev.map((s) => (s.id === id ? { ...s, isPinned } : s)))
  }, [])

  const handleToggleAgentTerminalPaused = useCallback(
    async (id: string, paused: boolean) => {
      const previous = agentSessions.find((session) => session.id === id)
      setAgentSessions((prev) =>
        prev.map((session) =>
          session.id === id
            ? {
                ...session,
                paused,
                lockedBy: paused ? 'user' : null,
                takeoverMode: paused ? 'manual' : null
              }
            : session
        )
      )

      try {
        await window.api.setAgentSessionPaused(id, paused)
      } catch (error) {
        if (previous) {
          setAgentSessions((prev) =>
            prev.map((session) =>
              session.id === id
                ? {
                    ...session,
                    paused: previous.paused ?? false,
                    lockedBy: previous.lockedBy ?? null,
                    takeoverMode: previous.takeoverMode ?? null
                  }
                : session
            )
          )
        }
        throw error
      }
    },
    [agentSessions]
  )

  const handleResolveAuth = useCallback(
    async (approved: boolean, alwaysAllow = false) => {
      if (pendingAuth) {
        await window.api.sendAgentAuthResponse(pendingAuth.requestId, approved, alwaysAllow)
        setPendingAuth(null)
      }
    },
    [pendingAuth]
  )

  return {
    agentSessions,
    setAgentSessions,
    thinkingTopics,
    pendingAuth,
    setPendingAuth,
    handleCreateTerminal,
    handleCloseTerminal,
    handleRenameTerminal,
    handleToggleTerminalPin,
    handleToggleAgentTerminalPaused,
    handleResolveAuth
  }
}
