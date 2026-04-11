import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  id: string
  onClose: () => void
  topicId?: string
  hostId?: string
  onFocusSession?: () => void
  fontSize?: number
  command?: string
  commandStatus?: string
}

export function TerminalView({
  id,
  onClose,
  topicId,
  onFocusSession,
  fontSize = 13
}: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)

  const onCloseRef = useRef(onClose)
  const onFocusSessionRef = useRef(onFocusSession)

  useEffect(() => {
    onCloseRef.current = onClose
    onFocusSessionRef.current = onFocusSession
  }, [onClose, onFocusSession])

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
    window.api.resizeSSH(id, term.cols, term.rows)
    window.api.attachSSH(id)

    let isBufferLoaded = false
    const cleanupData = window.api.onSSHData(id, (data) => {
      if (isBufferLoaded) {
        term.write(data)
      }
    })

    // Load initial buffer
    window.api
      .getSSHBuffer(id)
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

    const cleanupClosed = window.api.onSSHClosed(id, () => {
      onCloseRef.current?.()
    })

    term.onData((data) => {
      term.focus()
      onFocusSessionRef.current?.()
      window.api.sendSSHInput(id, data, topicId || '')
    })

    term.onResize(({ cols, rows }) => {
      window.api.resizeSSH(id, cols, rows)
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
      term.dispose()
    }
  }, [id, topicId])

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
