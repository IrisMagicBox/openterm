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
  fontSize?: number
}

export function TerminalView({
  sessionId,
  onClose,
  topicId,
  hostId,
  commandAssistEnabled,
  onFocusSession,
  onSuggestionChange,
  fontSize = 13
}: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const currentLineRef = useRef('')
  const isCompletingRef = useRef(false)
  const pendingSuggestionRef = useRef<{ partial: string; completion: string } | null>(null)

  const onCloseRef = useRef(onClose)
  const commandAssistEnabledRef = useRef(commandAssistEnabled)
  const onFocusSessionRef = useRef(onFocusSession)
  const onSuggestionChangeRef = useRef(onSuggestionChange)

  useEffect(() => {
    onCloseRef.current = onClose
    commandAssistEnabledRef.current = commandAssistEnabled
    onFocusSessionRef.current = onFocusSession
    onSuggestionChangeRef.current = onSuggestionChange
  }, [onClose, commandAssistEnabled, onFocusSession, onSuggestionChange])

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
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

    const handleMouseDown = () => {
      term.focus()
      onFocusSessionRef.current?.()
    }
    terminalRef.current.addEventListener('mousedown', handleMouseDown)

    xtermRef.current = term

    // Initial resize and attach
    window.api.resizeSSH(sessionId, term.cols, term.rows)
    window.api.attachSSH(sessionId)

    let isBufferLoaded = false
    const cleanupData = window.api.onSSHData(sessionId, (data) => {
      if (isBufferLoaded) {
        term.write(data)
      }
    })

    // Load initial buffer
    window.api
      .getSSHBuffer(sessionId)
      .then((buffer) => {
        if (buffer) {
          term.write(buffer)
        }
      })
      .catch(() => {
        // Fall back to live streaming when the initial buffer is unavailable.
      })
      .finally(() => {
        isBufferLoaded = true
      })

    const cleanupClosed = window.api.onSSHClosed(sessionId, () => {
      onCloseRef.current?.()
    })

    term.onData((data) => {
      term.focus()
      onFocusSessionRef.current?.()

      if (commandAssistEnabledRef.current && data === '\t' && topicId && hostId && !isCompletingRef.current) {
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
              window.api.sendSSHInput(sessionId, suffix, topicId)
            }
            pendingSuggestionRef.current = null
            onSuggestionChangeRef.current?.(null)
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
              onSuggestionChangeRef.current?.({ partial: partialCommand, completion })
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
        onSuggestionChangeRef.current?.(null)
      } else if (data === '\u007f') {
        currentLineRef.current = currentLineRef.current.slice(0, -1)
        pendingSuggestionRef.current = null
        onSuggestionChangeRef.current?.(null)
      } else if (data >= ' ' && data !== '\u007f') {
        currentLineRef.current += data
        pendingSuggestionRef.current = null
        onSuggestionChangeRef.current?.(null)
      }
      window.api.sendSSHInput(sessionId, data, topicId)
    })

    term.onResize(({ cols, rows }) => {
      window.api.resizeSSH(sessionId, cols, rows)
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch (err) {
        // Ignore fit errors when element is not visible
      }
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      cleanupData()
      cleanupClosed()
      terminalRef.current?.removeEventListener('mousedown', handleMouseDown)
      onSuggestionChangeRef.current?.(null)
      term.dispose()
    }
  }, [sessionId, topicId, hostId])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize
      // We need to wait a tiny bit for the font to apply before fitting
      setTimeout(() => {
        const fitAddon = new FitAddon()
        xtermRef.current?.loadAddon(fitAddon)
        fitAddon.fit()
      }, 50)
    }
  }, [fontSize])

  return (
    <div className="w-full h-full relative">
      <div ref={terminalRef} className="w-full h-full p-1" />
    </div>
  )
}
