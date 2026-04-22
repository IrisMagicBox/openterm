import { useEffect, useState } from 'react'
import type { TerminalSession } from '../../../shared/types'
import type { TerminalPreview } from '../lib/terminal-stage'

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g

function lastMeaningfulLine(value: string): string {
  const cleaned = value.replace(ANSI_PATTERN, '').replace(/\r/g, '\n').replace(/\x08/g, '')
  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (lines[lines.length - 1] || '').slice(0, 240)
}

export function useTerminalPreviews(
  visibleSessions: TerminalSession[]
): Record<string, TerminalPreview> {
  const [previews, setPreviews] = useState<Record<string, TerminalPreview>>({})
  const sessionKey = visibleSessions.map((session) => `${session.id}:${session.hostId}`).join('|')

  useEffect(() => {
    let cancelled = false
    const visibleIds = new Set(visibleSessions.map((session) => session.id))
    setPreviews((current) => {
      const next: Record<string, TerminalPreview> = {}
      Object.entries(current).forEach(([sessionId, preview]) => {
        if (visibleIds.has(sessionId)) next[sessionId] = preview
      })
      return next
    })

    const cleanups = visibleSessions.map((session) => {
      const updatePreview = (data: string): void => {
        if (cancelled) return
        const lastLine = lastMeaningfulLine(data)
        if (!lastLine) return
        setPreviews((current) => ({
          ...current,
          [session.id]: {
            sessionId: session.id,
            lastLine,
            updatedAt: Date.now()
          }
        }))
      }

      const bufferPromise =
        session.hostId === 'local'
          ? window.api.getLocalBuffer(session.id)
          : window.api.getSSHBuffer(session.id)

      bufferPromise.then(updatePreview).catch(() => {
        // Live data will fill the preview when the buffer is unavailable.
      })

      return window.api.onSSHData(session.id, updatePreview)
    })

    return () => {
      cancelled = true
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [sessionKey])

  return previews
}
