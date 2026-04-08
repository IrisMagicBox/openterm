import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  sessionId: string
  onClose: () => void
  topicId?: string
  hostId?: string
  commandAssistEnabled?: boolean
  onFocusSession?: () => void
  onSuggestionChange?: (suggestion: { partial: string; completion: string } | null) => void
}

export function TerminalView({
  sessionId,
  onClose,
  topicId,
  hostId,
  commandAssistEnabled,
  onFocusSession,
  onSuggestionChange
}: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const currentLineRef = useRef('')
  const isCompletingRef = useRef(false)
  const pendingSuggestionRef = useRef<{ partial: string; completion: string } | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b1e',
        foreground: '#d1d5db',
        cursor: '#60a5fa',
        selectionBackground: '#374151',
        black: '#1a1b1e',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#d1d5db',
        brightBlack: '#6b7280',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    })

    const fitAddon = new FitAddon()
    const clipboardAddon = new ClipboardAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(clipboardAddon)
    term.open(terminalRef.current)
    fitAddon.fit()
    const handleMouseDown = () => onFocusSession?.()
    terminalRef.current.addEventListener('mousedown', handleMouseDown)

    xtermRef.current = term

    // Initial resize
    window.api.resizeSSH(sessionId, term.cols, term.rows)

    const cleanupData = window.api.onSSHData(sessionId, (data) => {
      term.write(data)
    })

    const cleanupClosed = window.api.onSSHClosed(sessionId, () => {
      onClose()
    })

    term.onData((data) => {
      onFocusSession?.()

      if (commandAssistEnabled && data === '\t' && topicId && hostId && !isCompletingRef.current) {
        const partialCommand = currentLineRef.current.trim()
        if (partialCommand.length > 0) {
          if (
            pendingSuggestionRef.current &&
            pendingSuggestionRef.current.partial === partialCommand &&
            pendingSuggestionRef.current.completion.startsWith(partialCommand)
          ) {
            const suffix = pendingSuggestionRef.current.completion.slice(partialCommand.length)
            if (suffix) {
              currentLineRef.current = pendingSuggestionRef.current.completion
              window.api.sendSSHInput(sessionId, suffix)
            }
            pendingSuggestionRef.current = null
            onSuggestionChange?.(null)
            return
          }

          isCompletingRef.current = true
          window.api
            .completeAgentCommand(topicId, hostId, partialCommand)
            .then((completion) => {
              if (!completion || !completion.startsWith(partialCommand)) return
              const suffix = completion.slice(partialCommand.length)
              if (!suffix) return
              pendingSuggestionRef.current = { partial: partialCommand, completion }
              onSuggestionChange?.({ partial: partialCommand, completion })
            })
            .finally(() => {
              isCompletingRef.current = false
            })
        }
        return
      }

      if (data === '\r') {
        currentLineRef.current = ''
        pendingSuggestionRef.current = null
        onSuggestionChange?.(null)
      } else if (data === '\u007f') {
        currentLineRef.current = currentLineRef.current.slice(0, -1)
        pendingSuggestionRef.current = null
        onSuggestionChange?.(null)
      } else if (data >= ' ' && data !== '\u007f') {
        currentLineRef.current += data
        pendingSuggestionRef.current = null
        onSuggestionChange?.(null)
      }
      window.api.sendSSHInput(sessionId, data)
    })

    term.onResize(({ cols, rows }) => {
      window.api.resizeSSH(sessionId, cols, rows)
    })

    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cleanupData()
      cleanupClosed()
      terminalRef.current?.removeEventListener('mousedown', handleMouseDown)
      onSuggestionChange?.(null)
      term.dispose()
    }
  }, [sessionId, topicId, hostId, commandAssistEnabled, onFocusSession, onSuggestionChange])

  return (
    <div className="w-full h-full relative">
      <div ref={terminalRef} className="w-full h-full p-1" />
    </div>
  )
}
