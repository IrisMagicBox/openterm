import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  sessionId: string
  onClose: () => void
}

export function TerminalView({ sessionId, onClose }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#ffffff',
        foreground: '#111827',
        cursor: '#3b82f6',
        selectionBackground: '#bfdbfe',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#ffffff',
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
      term.dispose()
    }
  }, [sessionId])

  return (
    <div className="w-full h-full bg-white relative">
      <div ref={terminalRef} className="w-full h-full p-4" />
    </div>
  )
}
