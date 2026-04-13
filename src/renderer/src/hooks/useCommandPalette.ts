import { useState, useEffect, useCallback } from 'react'
import type { TerminalSession } from '../../../shared/types'

export function useCommandPalette(visibleSessions: TerminalSession[]) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteValue, setCommandPaletteValue] = useState('')
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)

  const focusedSession =
    visibleSessions.find((session) => session.id === focusedSessionId) || visibleSessions[0]

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (visibleSessions.length === 0) {
      setFocusedSessionId(null)
      return
    }

    if (!focusedSessionId || !visibleSessions.some((session) => session.id === focusedSessionId)) {
      setFocusedSessionId(visibleSessions[0].id)
    }
  }, [focusedSessionId, visibleSessions])

  const openCommandPalette = useCallback(() => {
    if (visibleSessions.length > 0 && !focusedSession) {
      setFocusedSessionId(visibleSessions[0].id)
    }
    setCommandPaletteOpen(true)
  }, [visibleSessions, focusedSession])

  return {
    commandPaletteOpen,
    commandPaletteValue,
    focusedSessionId,
    focusedSession,
    setCommandPaletteOpen,
    setCommandPaletteValue,
    setFocusedSessionId,
    openCommandPalette
  }
}
