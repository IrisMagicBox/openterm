import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { Sparkles, X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { FileDragData } from './terminal/FileBrowser'
import type { TerminalCommandCompletionUiEvent } from '../../../shared/terminal-command-assist'
import type { TerminalSessionRole, TerminalTakeoverMode } from '../../../shared/types'
import {
  buildTerminalModelCompletion,
  contextualCompletionDelayForTerminalInput,
  expandSingleTokenCompletionFromHistory,
  getTerminalShiftTabCompletionAction,
  updateTerminalInputBuffer,
  type TerminalCompletionResult
} from '../lib/terminal-completion'

const TERMINAL_COMPLETION_PREFETCH_DEBOUNCE_MS = 900
const TERMINAL_COMPLETION_PREFETCH_MIN_INTERVAL_MS = 1200

interface TerminalViewProps {
  id: string
  onClose: () => void
  topicId?: string
  hostId?: string
  hostAlias?: string
  terminalName?: string
  terminalRole?: TerminalSessionRole
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
  commandAssist?: TerminalCommandAssistProps | null
}

interface TerminalCommandAssistProps {
  open: boolean
  value: string
  targetLabel?: string
  historyCommands: string[]
  busy?: boolean
  error?: string | null
  onChange: (value: string) => void
  onSubmit: (context?: { currentInput: string }) => Promise<string | null>
  onClose: () => void
}

export function TerminalView({
  id,
  onClose,
  topicId,
  hostId,
  hostAlias,
  terminalName,
  terminalRole,
  onFocusSession,
  fontSize = 13,
  commandStatus,
  commandSource,
  paused = false,
  lockedBy = null,
  takeoverMode = null,
  onFileDrop,
  commandAssist
}: TerminalViewProps): React.ReactElement {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const commandAssistInputRef = useRef<HTMLTextAreaElement>(null)
  const initialFontSizeRef = useRef(fontSize)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAgentExecuting, setIsAgentExecuting] = useState(false)
  const [completion, setCompletion] = useState<TerminalCompletionResult | null>(null)
  const [completionPending, setCompletionPending] = useState(false)
  const [completionAnchor, setCompletionAnchor] = useState({ left: 12, top: 12 })

  const onCloseRef = useRef(onClose)
  const onFocusSessionRef = useRef(onFocusSession)
  const inputBufferRef = useRef('')
  const completionRef = useRef<TerminalCompletionResult | null>(null)
  const completionVisibleRef = useRef(false)
  const completionPendingRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const completionRequestRef = useRef(0)
  const completionLastRequestAtRef = useRef(0)
  const updateAnchorRef = useRef<() => void>(() => undefined)
  const sendTerminalInputRef = useRef<(data: string) => void>(() => undefined)
  const terminalContextRef = useRef({ hostAlias, terminalName, terminalRole })
  const sidebarResizingRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
    onFocusSessionRef.current = onFocusSession
  }, [onClose, onFocusSession])

  useEffect(() => {
    terminalContextRef.current = { hostAlias, terminalName, terminalRole }
  }, [hostAlias, terminalName, terminalRole])

  useEffect(() => {
    const terminalNode = terminalRef.current
    if (!terminalNode) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: initialFontSizeRef.current,
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
    term.open(terminalNode)
    fitAddonRef.current = fitAddon

    const handleMouseDown = (): void => {
      term.focus()
      onFocusSessionRef.current?.()
    }
    terminalNode.addEventListener('mousedown', handleMouseDown)

    xtermRef.current = term

    const isLocal = hostId === 'local'

    const cleanupAgentExecuting = window.api.onTerminalAgentExecuting(id, setIsAgentExecuting)

    const sendTerminalInput = (data: string): void => {
      onFocusSessionRef.current?.()
      if (isLocal) {
        window.api.sendLocalInput(id, data)
      } else {
        window.api.sendSSHInput(id, data, topicId || '')
      }
    }
    sendTerminalInputRef.current = sendTerminalInput

    const updateCompletionAnchor = (): void => {
      const outerNode = terminalNode.parentElement
      if (!outerNode || term.cols <= 0 || term.rows <= 0) return

      const terminalRect = terminalNode.getBoundingClientRect()
      const outerRect = outerNode.getBoundingClientRect()
      const cellWidth = terminalRect.width / Math.max(term.cols, 1)
      const cellHeight = terminalRect.height / Math.max(term.rows, 1)
      const preferredLeft =
        terminalRect.left - outerRect.left + term.buffer.active.cursorX * cellWidth + 8
      const preferredTop =
        terminalRect.top - outerRect.top + (term.buffer.active.cursorY + 1) * cellHeight + 6

      setCompletionAnchor({
        left: Math.max(8, Math.min(preferredLeft, outerRect.width - 280)),
        top: Math.max(8, Math.min(preferredTop, outerRect.height - 48))
      })
    }
    updateAnchorRef.current = updateCompletionAnchor

    const logCompletionUiEvent = (
      event: Omit<TerminalCommandCompletionUiEvent, 'sessionId' | 'topicId'>
    ): void => {
      window.api.logTerminalCompletionUiEvent({
        ...event,
        sessionId: id,
        topicId
      })
    }

    const setNextCompletion = (
      next: TerminalCompletionResult | null,
      options: { visible?: boolean; trigger?: 'prefetch' | 'manual'; reason?: string } = {}
    ): void => {
      const visible = Boolean(next && options.visible)
      const previous = completionRef.current
      completionRef.current = next
      completionVisibleRef.current = visible
      setCompletion(visible ? next : null)
      completionPendingRef.current = false
      setCompletionPending(false)
      if (next && visible) updateCompletionAnchor()
      if (next) {
        logCompletionUiEvent({
          event: 'candidate-stored',
          trigger: options.trigger,
          visible,
          pending: false,
          input: next.input,
          candidate: next.value,
          confidence: next.confidence,
          reason: options.reason
        })
      } else if (previous) {
        logCompletionUiEvent({
          event: 'candidate-cleared',
          visible: false,
          pending: false,
          input: inputBufferRef.current,
          candidate: previous.value,
          confidence: previous.confidence,
          reason: options.reason
        })
      }
    }

    const hideCompletion = (): void => {
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
      completionRequestRef.current += 1
      completionPendingRef.current = false
      setCompletionPending(false)
      setNextCompletion(null)
    }

    const acceptCompletion = (next: TerminalCompletionResult): void => {
      logCompletionUiEvent({
        event: 'candidate-accepted',
        visible: completionVisibleRef.current,
        pending: false,
        input: next.input,
        candidate: next.value,
        confidence: next.confidence
      })
      sendTerminalInput(next.insertText)
      inputBufferRef.current = next.value
      hideCompletion()
      requestAnimationFrame(updateCompletionAnchor)
    }

    const preserveCurrentCompletionIfUseful = (): boolean => {
      const existingCompletion = completionRef.current
      if (!existingCompletion) return false

      const currentInput = inputBufferRef.current
      if (!existingCompletion.value.startsWith(currentInput)) return false
      const suffix = existingCompletion.value.slice(currentInput.length)
      if (!suffix) return false

      const refreshedCompletion: TerminalCompletionResult = {
        ...existingCompletion,
        input: currentInput,
        suffix,
        insertText: suffix,
        mode: 'append'
      }

      setNextCompletion(refreshedCompletion, {
        visible: completionVisibleRef.current,
        reason: 'preserve-current-input'
      })
      return true
    }

    const runCompletionRequest = (
      input: string,
      requestId: number,
      options: { showPending?: boolean; trigger: 'prefetch' | 'manual' }
    ): void => {
      completionTimerRef.current = null
      if (options.showPending) {
        completionPendingRef.current = true
        setCompletionPending(true)
        updateCompletionAnchor()
      }

      void (async (): Promise<void> => {
        const trimmedInput = input.trim()
        const [historyResult, screenResult] = await Promise.allSettled([
          window.api.searchCommands(trimmedInput, 12),
          isLocal ? window.api.getLocalBuffer(id) : window.api.getSSHBuffer(id)
        ])

        if (completionRequestRef.current !== requestId) return

        const historyCommands =
          historyResult.status === 'fulfilled'
            ? historyResult.value.map((entry) => entry.content)
            : []
        const screen = screenResult.status === 'fulfilled' ? screenResult.value : ''

        try {
          const terminalContext = terminalContextRef.current
          completionLastRequestAtRef.current = Date.now()
          const result = await window.api.completeTerminalCommand({
            topicId,
            currentInput: input,
            trigger: options.trigger,
            session: {
              id,
              hostId: hostId || (isLocal ? 'local' : 'remote'),
              hostAlias: terminalContext.hostAlias || (isLocal ? '本机' : hostId || '远程主机'),
              name: terminalContext.terminalName,
              role: terminalContext.terminalRole
            },
            historyCommands,
            screen
          })
          const isLatestRequest = completionRequestRef.current === requestId
          if (!isLatestRequest) return

          const nextCompletion = buildTerminalModelCompletion(
            input,
            expandSingleTokenCompletionFromHistory(input, result.command, historyCommands),
            result.confidence || 'medium'
          )

          if (!nextCompletion) {
            if (preserveCurrentCompletionIfUseful()) return
            setNextCompletion(null, { trigger: options.trigger, reason: result.reason })
            return
          }

          setNextCompletion(nextCompletion, {
            visible: true,
            trigger: options.trigger,
            reason: result.reason
          })
        } catch {
          if (completionRequestRef.current !== requestId) return
          if (!preserveCurrentCompletionIfUseful()) {
            setNextCompletion(null, { trigger: options.trigger, reason: 'request-error' })
          }
        }
      })().catch(() => {
        if (completionRequestRef.current === requestId) {
          if (!preserveCurrentCompletionIfUseful()) {
            setNextCompletion(null, { trigger: options.trigger, reason: 'request-error' })
          }
        }
      })
    }

    const refreshCompletion = (input: string): void => {
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }

      completionRequestRef.current += 1
      const requestId = completionRequestRef.current

      const trimmedInput = input.trim()

      if (!trimmedInput || trimmedInput.length > 200) {
        setNextCompletion(null, { reason: trimmedInput ? 'input-too-long' : 'empty-input' })
        return
      }

      if (!preserveCurrentCompletionIfUseful()) {
        setNextCompletion(null, { reason: 'input-changed' })
      }

      const minIntervalDelay = Math.max(
        0,
        TERMINAL_COMPLETION_PREFETCH_MIN_INTERVAL_MS -
          (Date.now() - completionLastRequestAtRef.current)
      )
      completionTimerRef.current = window.setTimeout(
        () => runCompletionRequest(input, requestId, { trigger: 'prefetch' }),
        Math.max(TERMINAL_COMPLETION_PREFETCH_DEBOUNCE_MS, minIntervalDelay)
      )
    }

    const requestContextualCompletionFromPrompt = (delayMs: number): void => {
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }

      completionRequestRef.current += 1
      const requestId = completionRequestRef.current
      const scheduledInput = inputBufferRef.current
      setNextCompletion(null, { reason: 'empty-prompt-enter' })

      logCompletionUiEvent({
        event: 'contextual-request-scheduled',
        trigger: 'prefetch',
        visible: false,
        pending: false,
        input: scheduledInput,
        reason: `enter-delay-${delayMs}ms`
      })

      completionTimerRef.current = window.setTimeout(() => {
        logCompletionUiEvent({
          event: 'contextual-request-started',
          trigger: 'prefetch',
          visible: false,
          pending: false,
          input: '',
          reason: 'enter-context'
        })
        runCompletionRequest('', requestId, { trigger: 'prefetch' })
      }, delayMs)
    }

    const doFitAndResize = (): void => {
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

    const handleTerminalInput = (data: string): void => {
      if (data.startsWith('\x1b')) {
        inputBufferRef.current = ''
        hideCompletion()
        sendTerminalInput(data)
        return
      }

      if (data === '\t') {
        hideCompletion()
        sendTerminalInput(data)
        return
      }

      const previousInput = inputBufferRef.current
      const contextualCompletionDelay = contextualCompletionDelayForTerminalInput(
        previousInput,
        data
      )
      const nextInput = updateTerminalInputBuffer(previousInput, data)
      inputBufferRef.current = nextInput
      sendTerminalInput(data)
      requestAnimationFrame(updateCompletionAnchor)
      if (contextualCompletionDelay !== null) {
        requestAnimationFrame(() =>
          requestContextualCompletionFromPrompt(contextualCompletionDelay)
        )
      } else {
        refreshCompletion(nextInput)
      }
    }

    term.attachCustomKeyEventHandler((event) => {
      if (
        event.type === 'keydown' &&
        event.key === 'Tab' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        if (!event.shiftKey) {
          hideCompletion()
          return true
        }

        event.preventDefault()
        event.stopPropagation()

        const pendingInput = inputBufferRef.current
        const action = getTerminalShiftTabCompletionAction({
          hasVisibleCompletion: completionVisibleRef.current,
          hasCompletionCandidate: Boolean(completionRef.current),
          completionPending: completionPendingRef.current,
          input: pendingInput
        })
        logCompletionUiEvent({
          event: 'shift-tab',
          action,
          visible: completionVisibleRef.current,
          pending: completionPendingRef.current,
          input: pendingInput,
          candidate: completionRef.current?.value,
          confidence: completionRef.current?.confidence
        })

        if (action === 'accept' && completionRef.current) {
          acceptCompletion(completionRef.current)
        } else if (action === 'request') {
          if (completionTimerRef.current) {
            window.clearTimeout(completionTimerRef.current)
            completionTimerRef.current = null
          }
          completionRequestRef.current += 1
          runCompletionRequest(pendingInput, completionRequestRef.current, {
            showPending: true,
            trigger: 'manual'
          })
        } else if (action === 'hide') {
          hideCompletion()
        }
        return false
      }
      return true
    })

    term.onData((data) => {
      handleTerminalInput(data)
    })

    term.onResize(({ cols, rows }) => {
      if (isLocal) {
        window.api.resizeLocal(id, cols, rows)
      } else {
        window.api.resizeSSH(id, cols, rows)
      }
    })

    const fitTerminal = (): void => {
      try {
        fitAddon.fit()
      } catch {
        // Ignore fit errors when element is not visible
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      if (sidebarResizingRef.current || document.body.dataset.sidebarResizing === 'true') return
      fitTerminal()
    })

    resizeObserver.observe(terminalNode)

    const handleResize = (): void => {
      fitTerminal()
    }
    const handleSidebarResizeStart = (): void => {
      sidebarResizingRef.current = true
    }
    const handleSidebarResizeEnd = (): void => {
      sidebarResizingRef.current = false
      window.requestAnimationFrame(fitTerminal)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('openterm:sidebar-resize-start', handleSidebarResizeStart)
    window.addEventListener('openterm:sidebar-resize-end', handleSidebarResizeEnd)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('openterm:sidebar-resize-start', handleSidebarResizeStart)
      window.removeEventListener('openterm:sidebar-resize-end', handleSidebarResizeEnd)
      resizeObserver.disconnect()
      cleanupData()
      cleanupClosed()
      cleanupAgentExecuting?.()
      if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current)
      completionRequestRef.current += 1
      completionRef.current = null
      completionVisibleRef.current = false
      completionPendingRef.current = false
      updateAnchorRef.current = () => undefined
      sendTerminalInputRef.current = () => undefined
      terminalNode.removeEventListener('mousedown', handleMouseDown)
      term.dispose()
    }
  }, [hostId, id, topicId])

  useEffect(() => {
    if (!commandAssist?.open) return
    updateAnchorRef.current()
    window.setTimeout(() => commandAssistInputRef.current?.focus(), 0)
  }, [commandAssist?.open])

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

  const handleCommandAssistSubmit = async (): Promise<void> => {
    if (!commandAssist?.open || commandAssist.busy || !commandAssist.value.trim()) return

    const currentInput = inputBufferRef.current
    const command = await commandAssist.onSubmit({ currentInput })
    if (!command) return

    const draftInput = `${currentInput.trim() ? '\x15' : ''}${command}`
    sendTerminalInputRef.current(draftInput)
    inputBufferRef.current = command
    completionRef.current = null
    completionVisibleRef.current = false
    completionPendingRef.current = false
    setCompletion(null)
    setCompletionPending(false)
    commandAssist.onClose()
    xtermRef.current?.focus()
    requestAnimationFrame(updateAnchorRef.current)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
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
      data-terminal-view
      onMouseEnter={() => {
        document.documentElement.dataset.zoomTarget = 'terminal'
      }}
      onMouseLeave={() => {
        if (document.documentElement.dataset.zoomTarget === 'terminal') {
          delete document.documentElement.dataset.zoomTarget
        }
      }}
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
      {(isAgentExecuting || (commandStatus === 'running' && commandSource === 'agent')) &&
        !isAutoTakeover &&
        !isManualTakeover && (
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
      {(completion || completionPending) && !commandAssist?.open && (
        <div
          className="pointer-events-none absolute z-20 flex max-w-[min(420px,calc(100%-24px))] items-center gap-2 rounded-lg border border-black/[0.08] bg-white/95 px-2.5 py-1.5 text-xs shadow-[0_12px_34px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{ left: completionAnchor.left, top: completionAnchor.top }}
        >
          {completion ? (
            <span className="min-w-0 truncate font-mono">
              {completion.mode === 'replace' ? (
                <>
                  <span className="text-muted-foreground/55 line-through">{completion.input}</span>
                  <span className="px-1 text-muted-foreground/60">→</span>
                  <span className="font-semibold text-foreground">{completion.value}</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground/70">{completion.input}</span>
                  <span className="font-semibold text-foreground">{completion.suffix}</span>
                </>
              )}
            </span>
          ) : (
            <span className="min-w-0 truncate font-medium text-muted-foreground">
              正在生成智能补全
            </span>
          )}
          <span className="shrink-0 rounded-full bg-black/[0.035] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {completion?.displayLabel || 'AI'}
          </span>
          {completion && completion.alternatives.length > 1 && (
            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground/70">
              +{completion.alternatives.length - 1}
            </span>
          )}
        </div>
      )}
      {commandAssist?.open && (
        <div
          className="absolute bottom-3 left-1/2 z-40 flex max-h-[calc(100%-24px)] w-[min(520px,calc(100%-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white/96 text-foreground shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-2xl"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">命令草稿</div>
              <div className="truncate text-[11px] font-semibold text-muted-foreground">
                {commandAssist.targetLabel || '当前终端'}
              </div>
            </div>
            <button
              aria-label="关闭命令助手"
              onClick={commandAssist.onClose}
              className="blue-ring rounded-md p-1 text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-3 py-2.5">
            <textarea
              ref={commandAssistInputRef}
              value={commandAssist.value}
              onChange={(event) => commandAssist.onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  commandAssist.onClose()
                  return
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void handleCommandAssistSubmit()
                }
              }}
              placeholder="告诉这个终端要写什么命令..."
              className="blue-ring min-h-20 w-full resize-none rounded-lg border border-black/[0.08] bg-black/[0.015] px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/45"
            />
            {commandAssist.historyCommands.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {commandAssist.historyCommands.slice(0, 3).map((command) => (
                  <span
                    key={command}
                    className="max-w-full truncate rounded-md bg-black/[0.035] px-1.5 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {command}
                  </span>
                ))}
              </div>
            )}
            {commandAssist.error && (
              <div className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-600">
                {commandAssist.error}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] px-3 py-2 text-[11px] font-semibold text-muted-foreground">
            <span>写入终端，Enter 执行</span>
            <button
              onClick={() => void handleCommandAssistSubmit()}
              disabled={!commandAssist.value.trim() || commandAssist.busy}
              className="blue-ring rounded-md bg-foreground px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-foreground/90 disabled:pointer-events-none disabled:bg-black/20"
            >
              {commandAssist.busy ? '生成中' : '写入'}
            </button>
          </div>
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
