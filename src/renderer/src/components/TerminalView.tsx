import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'
import { FileDragData } from './terminal/FileBrowser'
import type { TerminalTakeoverMode } from '../../../shared/types'

interface TerminalViewProps {
  id: string
  onClose: () => void
  topicId?: string
  hostId?: string
  onFocusSession?: () => void
  fontSize?: number
  command?: string
  commandStatus?: string
  commandSource?: 'agent' | 'user'
  paused?: boolean
  lockedBy?: 'agent' | 'user' | null
  takeoverMode?: TerminalTakeoverMode | null
  onFileDrop?: (
    sourceHostId: string,
    sourcePath: string,
    fileName: string,
    destHostId: string,
    destPath: string
  ) => void
}

export function TerminalView({
  id,
  onClose,
  topicId,
  hostId,
  onFocusSession,
  fontSize = 13,
  commandStatus,
  commandSource,
  paused = false,
  lockedBy = null,
  takeoverMode = null,
  onFileDrop,
}: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAgentExecuting, setIsAgentExecuting] = useState(false)

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
        background: '#ffffff',
        foreground: '#1f2937',
        cursor: '#3b82f6',
        cursorAccent: '#ffffff',
        selectionBackground: '#e5e7eb',
        black: '#000000',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#ca8a04',
        blue: '#2563eb',
        magenta: '#d33bbd',
        cyan: '#0891b2',
        white: '#ffffff',
        brightBlack: '#4b5563',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#60a5fa',
        brightMagenta: '#f472b6',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    })

    const fitAddon = new FitAddon()
    const clipboardAddon = new ClipboardAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(clipboardAddon)
    term.open(terminalRef.current)
    fitAddonRef.current = fitAddon

    const handleMouseDown = () => {
      term.focus()
      onFocusSessionRef.current?.()
    }
    terminalRef.current.addEventListener('mousedown', handleMouseDown)

    xtermRef.current = term

    const isLocal = hostId === 'local'

    let cleanupAgentExecuting: (() => void) | undefined
    cleanupAgentExecuting = window.api.onTerminalAgentExecuting(id, setIsAgentExecuting)

    const doFitAndResize = () => {
      try {
        fitAddon.fit()
        if (term.cols > 0 && term.rows > 0) {
          if (isLocal) {
            window.api.resizeLocal(id, term.cols, term.rows)
          } else {
            window.api.resizeSSH(id, term.cols, term.rows)
          }
          if (isLocal) {
            window.api.attachLocal(id)
          } else {
            window.api.attachSSH(id)
          }
        } else {
          requestAnimationFrame(doFitAndResize)
        }
      } catch {
        requestAnimationFrame(doFitAndResize)
      }
    }

    requestAnimationFrame(() => {
      doFitAndResize()
      term.focus()
    })

    let isBufferLoaded = false
    const cleanupData = window.api.onSSHData(id, (data) => {
      if (isBufferLoaded) {
        term.write(data)
      }
    })

    // Load initial buffer
    const bufferPromise = isLocal ? window.api.getLocalBuffer(id) : window.api.getSSHBuffer(id)
    bufferPromise
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
      onFocusSessionRef.current?.()
      if (isLocal) {
        window.api.sendLocalInput(id, data)
      } else {
        window.api.sendSSHInput(id, data, topicId || '')
      }
    })

    term.onResize(({ cols, rows }) => {
      if (isLocal) {
        window.api.resizeLocal(id, cols, rows)
      } else {
        window.api.resizeSSH(id, cols, rows)
      }
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
      cleanupAgentExecuting?.()
      terminalRef.current?.removeEventListener('mousedown', handleMouseDown)
      term.dispose()
    }
  }, [id, topicId])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize
      // Wait for the font to apply before re-fitting
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
        } catch {
          // Ignore fit errors
        }
      }, 50)
    }
  }, [fontSize])

  const isAutoTakeover = lockedBy === 'user' && takeoverMode === 'auto' && !paused
  const isManualTakeover = paused && takeoverMode === 'manual'

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return

    let dragData: FileDragData
    try {
      dragData = JSON.parse(raw)
    } catch {
      return
    }

    if (dragData.type !== 'file-transfer' || !hostId) return

    if (dragData.sourceHostId === hostId) return

    if (!onFileDrop) return

    const destPath = `~/Downloads/${dragData.fileName}`
    onFileDrop(dragData.sourceHostId, dragData.sourcePath, dragData.fileName, hostId, destPath)
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex pointer-events-none items-center justify-center rounded-xl border-2 border-accent/45 bg-accent/10">
          <span className="rounded-full border border-white/75 bg-white/85 px-3 py-1.5 text-xs font-bold text-accent shadow-sm backdrop-blur-xl">
            释放以下载文件
          </span>
        </div>
      )}
      {((isAgentExecuting || (commandStatus === 'running' && commandSource === 'agent')) &&
        !isAutoTakeover &&
        !isManualTakeover) && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-accent/20">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Agent 执行中...
        </div>
      )}
      {isAutoTakeover && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-warning px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-warning/20">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          用户已接管
        </div>
      )}
      {isManualTakeover && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-warning px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-warning/20">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          人工接管中
        </div>
      )}
      <div
        ref={terminalRef}
        className="h-full w-full overflow-hidden rounded-xl p-2"
        onMouseDown={() => xtermRef.current?.focus()}
      />
    </div>
  )
}
