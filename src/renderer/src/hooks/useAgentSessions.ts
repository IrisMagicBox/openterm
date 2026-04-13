import { useState, useEffect, useCallback } from 'react'
import type { TerminalSession, Topic } from '../../../shared/types'

interface PendingAuth {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
}

export function useAgentSessions({ selectedTopic }: { selectedTopic: Topic | null }) {
  const [agentSessions, setAgentSessions] = useState<TerminalSession[]>([])
  const [thinkingTopics, setThinkingTopics] = useState<Set<string>>(new Set())
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null)

  useEffect(() => {
    const unlistenAuth = window.api.onAgentAuthRequest((requestId, command, riskLevel, reason) =>
      setPendingAuth({ requestId, command, riskLevel, reason })
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
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.id === data.id)
        if (exists) {
          return prev.map((s) =>
            s.id === data.id ? { ...s, ...data, visible: true, paused: s.paused ?? false } : s
          )
        }
        return [...prev, { ...data, visible: true, paused: false }]
      })
    })

    const unlistenTerminalHide = window.api.onAgentTerminalHide(({ id }) => {
      setAgentSessions((prev) => prev.map((s) => (s.id === id ? { ...s, visible: false } : s)))
    })

    const unlistenSessionCreated = window.api.onAgentSessionCreated((data) => {
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.id === data.id)
        if (exists) return prev
        return [...prev, { ...data, visible: true, paused: false }]
      })
    })

    const unlistenSessionClosed = window.api.onAgentSessionClosed(({ id }) => {
      setAgentSessions((prev) => prev.filter((s) => s.id !== id))
    })

    // Reset sessions when topic changes to avoid stale data
    setAgentSessions([])

    return () => {
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

    agentSessions.forEach((session) => {
      const unsubStart = window.api.onTerminalCommandStart(session.id, (data) => {
        setAgentSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  command: data.command,
                  commandStatus: 'running',
                  commandStartTime: Date.now(),
                  commandExitCode: undefined,
                  commandDurationMs: undefined
                }
              : s
          )
        )
      })

      const unsubEnd = window.api.onTerminalCommandEnd(session.id, (data) => {
        setAgentSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
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

      unsubscribers.push(unsubStart, unsubEnd)
    })

    return () => {
      unsubscribers.forEach((fn) => fn())
    }
  }, [agentSessions.map((s) => s.id).join(',')])

  const handleCreateTerminal = useCallback(
    async (hostId: string) => {
      if (!selectedTopic) return
      await window.api.createAgentTerminal(selectedTopic.id, hostId)
    },
    [selectedTopic]
  )

  const handleCloseTerminal = useCallback(async (id: string) => {
    await window.api.closeAgentTerminal(id)
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

  const handleToggleAgentTerminalPaused = useCallback(async (id: string, paused: boolean) => {
    await window.api.setAgentSessionPaused(id, paused)
    setAgentSessions((prev) =>
      prev.map((session) => (session.id === id ? { ...session, paused } : session))
    )
  }, [])

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
