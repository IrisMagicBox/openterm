import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Clock, PanelRight, Plus } from 'lucide-react'
import { TopicHub } from '../TopicHub'
import { Host, Topic, TerminalSession } from '../../../../shared/types'
import { AgentRunDetailDrawer } from '../AgentRunDetailDrawer'
import { AgentStepStream } from '../AgentStepStream'
import { AgentLiveStream } from '../AgentLiveStream'
import { ModelSelector } from '../ModelSelector'
import { PortForwardingPanel } from '../terminal/PortForwardingPanel'
import { ChatInput } from './ChatInput'
import { MessageBubble, ThinkingIndicator, EmptyState } from './MessageBubble'
import { TerminalStage } from './TerminalStage'
import { AuthModal } from '../AuthModal'
import { useProvider } from '../../hooks/useProvider'
import { isAgentRuntimeProvider, isAgentUsableModel } from '../../config/providers'
import { useVisibilityRestore } from '../../hooks/useVisibilityRestore'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useTerminalPreviews } from '../../hooks/useTerminalPreviews'
import { useTerminalStageState } from '../../hooks/useTerminalStageState'
import { deriveTerminalActivities } from '../../lib/terminal-stage'
import { getErrorMessage } from '../../../../shared/errors'
import { Dialog, DialogContent, IconButton, PageHeader, Tooltip } from '../ui'

import { LOCAL_HOST } from '../../constants'

const CHAT_ZOOM_STORAGE_KEY = 'openterm.chat.zoom'
const CHAT_ZOOM_STORAGE_VERSION_KEY = 'openterm.chat.zoom.version'
const CHAT_ZOOM_STORAGE_VERSION = '2'
const TOPIC_WORKSPACE_WIDTH_STORAGE_KEY = 'openterm.topicWorkspace.width'
const DEFAULT_CHAT_ZOOM = 0.94
const CHAT_BASE_FONT_SIZE = 13
const CHAT_ZOOM_STEP = 0.06
const MIN_CHAT_ZOOM = 0.25
const MAX_CHAT_ZOOM = 1.18
const MIN_TERMINAL_STAGE_WIDTH = 360
const MIN_CHAT_COLUMN_WIDTH = 420
const DEFAULT_TOPIC_WORKSPACE_WIDTH = 264
const MIN_TOPIC_WORKSPACE_WIDTH = 224
const MAX_TOPIC_WORKSPACE_WIDTH = 360
const TOPIC_WORKSPACE_EXIT_MS = 440

function clampChatZoom(value: number): number {
  return Math.max(MIN_CHAT_ZOOM, Math.min(MAX_CHAT_ZOOM, value))
}

function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.max(minWidth, Math.min(maxWidth, width))
}

function isZoomInKey(event: KeyboardEvent): boolean {
  return (
    event.key === '=' || event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd'
  )
}

function isZoomOutKey(event: KeyboardEvent): boolean {
  return (
    event.key === '-' ||
    event.key === '_' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract'
  )
}

function isZoomResetKey(event: KeyboardEvent): boolean {
  return event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0'
}

type ZoomDirection = 'in' | 'out' | 'reset'

interface PendingAuth {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  metadata?: Record<string, unknown>
}

interface ChatPanelProps {
  topic: Topic
  hosts: Host[]
  prefill?: string
  thinking?: boolean
  onManageHosts: () => void
  agentSessions: TerminalSession[]
  terminalWidth: number
  setTerminalWidth: (w: number) => void
  terminalFontSize: number
  onRemoveHostFromTopic: (id: string) => Promise<void>
  onOpenFileBrowser: (host: Host) => void
  onCreateTerminal: (id: string) => Promise<void>
  onCloseTerminal: (id: string) => Promise<void>
  onRenameTerminal: (id: string, name: string) => Promise<void>
  onToggleTerminalPin: (id: string, pinned: boolean) => Promise<void>
  onUpdateModel: (topicId: string, providerId: string, modelId: string) => Promise<void>
  pendingAuth?: PendingAuth | null
  onResolveAuth?: (approved: boolean, alwaysAllow?: boolean) => void | Promise<void>
}

export function ChatPanel({
  topic,
  hosts,
  prefill,
  thinking,
  onManageHosts,
  agentSessions,
  terminalWidth,
  setTerminalWidth,
  terminalFontSize,
  onRemoveHostFromTopic,
  onOpenFileBrowser,
  onCreateTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onToggleTerminalPin,
  onUpdateModel,
  pendingAuth,
  onResolveAuth
}: ChatPanelProps): React.ReactElement {
  const [inputValue, setInputValue] = useState(prefill || '')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [resizeRightEdge, setResizeRightEdge] = useState<number | null>(null)
  const [portForwardHost, setPortForwardHost] = useState<{ id: string; alias: string } | null>(null)
  const [runDetailId, setRunDetailId] = useState<string | null>(null)
  const [pausingRun, setPausingRun] = useState(false)
  const [commandPaletteSessionId, setCommandPaletteSessionId] = useState<string | null>(null)
  const [commandPaletteHistory, setCommandPaletteHistory] = useState<string[]>([])
  const [commandPaletteBusy, setCommandPaletteBusy] = useState(false)
  const [commandPaletteError, setCommandPaletteError] = useState<string | null>(null)
  const [chatZoom, setChatZoom] = useState(() => {
    const storedRaw = window.localStorage.getItem(CHAT_ZOOM_STORAGE_KEY)
    const storageVersion = window.localStorage.getItem(CHAT_ZOOM_STORAGE_VERSION_KEY)
    const stored = Number(storedRaw)
    if (storageVersion !== CHAT_ZOOM_STORAGE_VERSION && Math.abs(stored - 1) < 0.001) {
      return DEFAULT_CHAT_ZOOM
    }
    return Number.isFinite(stored) && stored > 0 ? clampChatZoom(stored) : DEFAULT_CHAT_ZOOM
  })
  const [workspaceOpen, setWorkspaceOpen] = useState(
    () => window.localStorage.getItem('openterm.topicWorkspace.open') !== 'false'
  )
  const [workspaceWidth, setWorkspaceWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(TOPIC_WORKSPACE_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
      ? clampPanelWidth(stored, MIN_TOPIC_WORKSPACE_WIDTH, MAX_TOPIC_WORKSPACE_WIDTH)
      : DEFAULT_TOPIC_WORKSPACE_WIDTH
  })
  const [workspacePresent, setWorkspacePresent] = useState(workspaceOpen)
  const [workspaceMotionOpen, setWorkspaceMotionOpen] = useState(workspaceOpen)
  const [workspaceResizeRightEdge, setWorkspaceResizeRightEdge] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldFollowScrollRef = useRef(true)
  const workspaceCloseTimerRef = useRef<number | null>(null)
  const workspaceMotionReadyRef = useRef(false)
  const { animationKey } = useVisibilityRestore()
  const { providers, models, defaultProviderId, defaultModelId } = useProvider()
  const runtimeProviders = providers.filter((provider) => isAgentRuntimeProvider(provider))
  const topicProviderId = runtimeProviders.find(
    (provider) => provider.enabled && provider.id === topic.selectedProviderId
  )?.id
  const defaultRuntimeProviderId = runtimeProviders.find(
    (provider) => provider.enabled && provider.id === defaultProviderId
  )?.id

  const selectedProviderId =
    topicProviderId ||
    defaultRuntimeProviderId ||
    runtimeProviders.find((p) => p.enabled)?.id ||
    null
  const selectedModelId =
    topic.selectedModelId ||
    (selectedProviderId
      ? (defaultModelId &&
        models.some(
          (model) => model.id === defaultModelId && model.providerId === selectedProviderId
        )
          ? defaultModelId
          : models.find(
              (model) => model.providerId === selectedProviderId && isAgentUsableModel(model)
            )?.id) || null
      : null)
  const {
    messages,
    activeSteps,
    activeParts,
    activeRunId: trackedActiveRunId,
    messageQueue,
    expandedThoughts,
    sendMessage,
    toggleThought,
    removeQueuedMessage,
    clearQueue
  } = useChatMessages(topic.id, thinking)
  const derivedActiveRunId = useMemo(() => {
    const activePart = [...activeParts]
      .reverse()
      .find((part) => part.status === 'running' || part.status === 'pending')
    if (activePart) return activePart.runId

    const activeStep = [...activeSteps].reverse().find((step) => step.runId)
    if (activeStep?.runId) return activeStep.runId

    return null
  }, [activeParts, activeSteps])
  const activeRunId = trackedActiveRunId || derivedActiveRunId
  const { commandPaletteOpen, commandPaletteValue, setCommandPaletteOpen, setCommandPaletteValue } =
    useCommandPalette()
  const realHosts = hosts.filter((h) => topic.hostIds.includes(h.id))
  const topicHosts = topic.hostIds.includes('local') ? [LOCAL_HOST, ...realHosts] : realHosts
  const topicHostIds = useMemo(() => new Set(topic.hostIds), [topic.hostIds])
  const topicSessions = useMemo(
    () => agentSessions.filter((session) => topicHostIds.has(session.hostId)),
    [agentSessions, topicHostIds]
  )
  const visibleSessions = useMemo(() => topicSessions.filter((s) => s.visible), [topicSessions])
  const terminalPreviews = useTerminalPreviews(visibleSessions)
  const terminalStage = useTerminalStageState(visibleSessions, activeParts)
  const terminalActivities = useMemo(
    () => deriveTerminalActivities(visibleSessions, activeParts, terminalPreviews),
    [activeParts, terminalPreviews, visibleSessions]
  )
  const filteredHosts = topicHosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(mentionFilter.toLowerCase()) || h.ip.includes(mentionFilter)
  )
  useEffect(() => {
    const node = scrollRef.current
    if (!node || !shouldFollowScrollRef.current) return
    node.scrollTop = node.scrollHeight
  }, [messages, thinking, activeSteps, activeParts])
  useEffect(() => {
    shouldFollowScrollRef.current = true
  }, [topic.id])
  useEffect(() => {
    window.localStorage.setItem('openterm.topicWorkspace.open', String(workspaceOpen))
  }, [workspaceOpen])
  useEffect(() => {
    if (!workspaceMotionReadyRef.current) {
      workspaceMotionReadyRef.current = true
      return undefined
    }

    if (workspaceCloseTimerRef.current !== null) {
      window.clearTimeout(workspaceCloseTimerRef.current)
      workspaceCloseTimerRef.current = null
    }

    if (workspaceOpen) {
      setWorkspacePresent(true)
      setWorkspaceMotionOpen(false)
      const frame = window.requestAnimationFrame(() => setWorkspaceMotionOpen(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setWorkspaceMotionOpen(false)
    workspaceCloseTimerRef.current = window.setTimeout(() => {
      setWorkspacePresent(false)
      workspaceCloseTimerRef.current = null
    }, TOPIC_WORKSPACE_EXIT_MS)
    return undefined
  }, [workspaceOpen])
  useEffect(
    () => () => {
      if (workspaceCloseTimerRef.current !== null) {
        window.clearTimeout(workspaceCloseTimerRef.current)
      }
    },
    []
  )
  useEffect(() => {
    window.localStorage.setItem(CHAT_ZOOM_STORAGE_KEY, chatZoom.toFixed(2))
    window.localStorage.setItem(CHAT_ZOOM_STORAGE_VERSION_KEY, CHAT_ZOOM_STORAGE_VERSION)
  }, [chatZoom])
  useEffect(() => {
    window.localStorage.setItem(
      TOPIC_WORKSPACE_WIDTH_STORAGE_KEY,
      String(Math.round(workspaceWidth))
    )
  }, [workspaceWidth])
  const openTerminalCommandPalette = useCallback(
    (sessionId?: string): void => {
      const targetSessionId =
        sessionId || terminalStage.focusedSessionId || visibleSessions[0]?.id || null
      if (!targetSessionId) return

      terminalStage.focusSession(targetSessionId, { userInitiated: true })
      setCommandPaletteSessionId(targetSessionId)
      setCommandPaletteValue('')
      setCommandPaletteError(null)
      setCommandPaletteOpen(true)
    },
    [setCommandPaletteOpen, setCommandPaletteValue, terminalStage, visibleSessions]
  )
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'b') return
      if (!event.altKey || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      setWorkspaceOpen((open) => !open)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.altKey) return
      event.preventDefault()
      openTerminalCommandPalette()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openTerminalCommandPalette])
  useEffect(() => {
    if (!commandPaletteOpen || !commandPaletteSessionId) return
    let cancelled = false
    const targetSession = visibleSessions.find((session) => session.id === commandPaletteSessionId)

    window.api
      .searchCommands('', 24)
      .then((commands) => {
        if (cancelled) return
        const history = commands
          .filter((command) => !targetSession || command.hostId === targetSession.hostId)
          .map((command) => command.content)
          .slice(0, 8)
        setCommandPaletteHistory(history)
      })
      .catch(() => {
        if (!cancelled) setCommandPaletteHistory([])
      })

    return () => {
      cancelled = true
    }
  }, [commandPaletteOpen, commandPaletteSessionId, visibleSessions])
  useEffect(() => {
    const applyChatZoom = (direction: ZoomDirection): void => {
      if (document.documentElement.dataset.zoomTarget !== 'chat') return
      if (direction === 'in') {
        setChatZoom((zoom) => clampChatZoom(zoom + CHAT_ZOOM_STEP))
        return
      }
      if (direction === 'out') {
        setChatZoom((zoom) => clampChatZoom(zoom - CHAT_ZOOM_STEP))
        return
      }
      setChatZoom(DEFAULT_CHAT_ZOOM)
    }

    const handleChatZoomKey = (event: KeyboardEvent): void => {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) return
      if (document.documentElement.dataset.zoomTarget !== 'chat') return

      if (isZoomInKey(event)) {
        event.preventDefault()
        applyChatZoom('in')
        return
      }
      if (isZoomOutKey(event)) {
        event.preventDefault()
        applyChatZoom('out')
        return
      }
      if (isZoomResetKey(event)) {
        event.preventDefault()
        applyChatZoom('reset')
      }
    }

    const unlistenZoomShortcut = window.api.onZoomShortcut(({ direction }) =>
      applyChatZoom(direction)
    )
    window.addEventListener('keydown', handleChatZoomKey)
    return () => {
      unlistenZoomShortcut()
      window.removeEventListener('keydown', handleChatZoomKey)
    }
  }, [])

  const chatScaleStyle = {
    zoom: chatZoom,
    '--chat-text-size': `${CHAT_BASE_FONT_SIZE}px`,
    '--chat-line-height': `${Math.round(CHAT_BASE_FONT_SIZE * 1.8)}px`
  } as React.CSSProperties
  const isResizing = resizeRightEdge !== null
  const isResizingWorkspace = workspaceResizeRightEdge !== null

  useEffect(() => {
    if (!isResizing && !isResizingWorkspace) return undefined
    document.body.dataset.panelResizing = 'true'
    return () => {
      delete document.body.dataset.panelResizing
    }
  }, [isResizing, isResizingWorkspace])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = e.target.value
    setInputValue(value)
    const lastWord = value.split(' ').pop() || ''
    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1))
    } else setShowMentions(false)
  }
  const insertMention = (host: Host): void => {
    const parts = inputValue.split(' ')
    parts.pop()
    setInputValue([...parts, `@${host.alias} `].join(' '))
    setShowMentions(false)
  }
  const handleSend = async (): Promise<void> => {
    if (!inputValue.trim()) return
    shouldFollowScrollRef.current = true
    const c = inputValue
    setInputValue('')
    await sendMessage(c)
  }
  const handlePauseRun = async (): Promise<void> => {
    if (!activeRunId || pausingRun) return
    setPausingRun(true)
    try {
      await window.api.cancelAgentRun(activeRunId)
    } finally {
      setPausingRun(false)
    }
  }
  const handleSubmitCommandPalette = async (context?: {
    currentInput: string
  }): Promise<string | null> => {
    if (!commandPaletteValue.trim() || commandPaletteBusy) return null
    const targetSession =
      visibleSessions.find((session) => session.id === commandPaletteSessionId) ||
      terminalStage.focusedSession
    if (!targetSession) return null

    setCommandPaletteBusy(true)
    setCommandPaletteError(null)
    try {
      const screen =
        targetSession.hostId === LOCAL_HOST.id
          ? await window.api.getLocalBuffer(targetSession.id)
          : await window.api.getSSHBuffer(targetSession.id)
      const { command } = await window.api.draftTerminalCommand({
        topicId: topic.id,
        request: commandPaletteValue,
        session: targetSession,
        historyCommands: commandPaletteHistory,
        screen,
        currentInput: context?.currentInput
      })
      terminalStage.focusSession(targetSession.id, { userInitiated: true })
      setCommandPaletteValue('')
      setCommandPaletteError(null)
      return command
    } catch (error) {
      setCommandPaletteError(getErrorMessage(error) || '命令生成失败')
      return null
    } finally {
      setCommandPaletteBusy(false)
    }
  }
  const handleFocusSession = (id: string): void =>
    terminalStage.focusSession(id, { userInitiated: true })

  return (
    <div
      ref={panelRef}
      className="workspace-canvas flex h-full min-w-0 overflow-hidden bg-transparent"
      data-topic-workspace-open={workspaceMotionOpen ? 'true' : 'false'}
    >
      <section
        className="workspace-primary-content flex min-w-0 flex-1 flex-col"
        onMouseEnter={() => {
          document.documentElement.dataset.zoomTarget = 'chat'
        }}
        onMouseLeave={() => {
          if (document.documentElement.dataset.zoomTarget === 'chat') {
            delete document.documentElement.dataset.zoomTarget
          }
        }}
      >
        <PageHeader
          title={topic.title}
          dense
          className="workspace-layer-header border-black/[0.05] bg-white/75"
          description={
            <>
              <Clock size={12} />
              {messages.length > 0 ? `${messages.length} 条消息` : '暂无消息'}
            </>
          }
          actions={
            <>
              <Tooltip side="bottom" content="添加主机到当前对话">
                <IconButton
                  aria-label="添加主机到当前对话"
                  onClick={onManageHosts}
                  className="workspace-top-icon-button text-muted-foreground"
                >
                  <Plus />
                </IconButton>
              </Tooltip>
              <Tooltip side="bottom" content="切换作战中心">
                <IconButton
                  aria-label={workspaceOpen ? '隐藏作战中心' : '显示作战中心'}
                  aria-expanded={workspaceOpen}
                  onClick={() => setWorkspaceOpen((open) => !open)}
                  className="workspace-top-icon-button topic-workspace-toggle-button text-muted-foreground"
                >
                  <PanelRight />
                </IconButton>
              </Tooltip>
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-5 no-scrollbar"
            onScroll={(event) => {
              const node = event.currentTarget
              const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
              shouldFollowScrollRef.current = distanceFromBottom < 96
            }}
          >
            <div style={chatScaleStyle} className="space-y-7">
              {messages.length === 0 && (
                <EmptyState
                  topicHosts={topicHosts}
                  onMentionHost={(alias) => setInputValue(`@${alias} `)}
                />
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  expandedThoughts={expandedThoughts}
                  onToggleThought={toggleThought}
                />
              ))}
              {thinking && activeParts.length > 0 && (
                <AgentLiveStream
                  parts={activeParts}
                  onRevealTerminal={terminalStage.revealTerminal}
                  focusedPartId={terminalStage.focusedPartId}
                />
              )}
              {thinking && activeParts.length === 0 && activeSteps.length > 0 && (
                <AgentStepStream steps={activeSteps} />
              )}
              {thinking && activeParts.length === 0 && activeSteps.length === 0 && (
                <ThinkingIndicator animationKey={animationKey} />
              )}
            </div>
          </div>

          <div style={chatScaleStyle}>
            <ChatInput
              inputValue={inputValue}
              onInputChange={handleInputChange}
              onSend={handleSend}
              thinking={!!thinking}
              onPause={handlePauseRun}
              canPause={!!thinking && !!activeRunId && !pausingRun}
              pausing={pausingRun}
              modelSelector={
                <ModelSelector
                  providers={providers}
                  models={models}
                  selectedProviderId={selectedProviderId}
                  selectedModelId={selectedModelId}
                  onSelect={(pid, mid) => {
                    onUpdateModel(topic.id, pid, mid)
                  }}
                  disabled={thinking}
                  triggerVariant="ghost"
                  triggerSize="sm"
                  triggerClassName="w-fit max-w-full px-3 text-[13px] font-medium"
                  menuAlign="start"
                />
              }
              messageQueue={messageQueue}
              onRemoveFromQueue={removeQueuedMessage}
              onClearQueue={clearQueue}
              showMentions={showMentions}
              filteredHosts={filteredHosts}
              onInsertMention={insertMention}
              authPrompt={
                pendingAuth && onResolveAuth ? (
                  <AuthModal
                    requestId={pendingAuth.requestId}
                    command={pendingAuth.command}
                    riskLevel={pendingAuth.riskLevel}
                    reason={pendingAuth.reason}
                    metadata={pendingAuth.metadata}
                    variant="attached"
                    onResolve={onResolveAuth}
                  />
                ) : null
              }
            />
          </div>
        </div>
      </section>

      {visibleSessions.length > 0 && (
        <TerminalStage
          visibleSessions={visibleSessions}
          focusedSession={terminalStage.focusedSession}
          focusedSessionId={terminalStage.focusedSessionId}
          activities={terminalActivities}
          mode={terminalStage.mode}
          followAgent={terminalStage.followAgent}
          terminalFontSize={terminalFontSize}
          terminalWidth={terminalWidth}
          isResizing={isResizing}
          topicId={topic.id}
          topicHosts={topicHosts}
          commandAssist={
            commandPaletteOpen
              ? {
                  sessionId: commandPaletteSessionId,
                  value: commandPaletteValue,
                  historyCommands: commandPaletteHistory,
                  busy: commandPaletteBusy,
                  error: commandPaletteError,
                  onChange: (value) => {
                    setCommandPaletteValue(value)
                    if (commandPaletteError) setCommandPaletteError(null)
                  },
                  onSubmit: handleSubmitCommandPalette,
                  onClose: () => {
                    setCommandPaletteOpen(false)
                    setCommandPaletteError(null)
                  }
                }
              : null
          }
          onCloseTerminal={onCloseTerminal}
          onOpenCommandPalette={openTerminalCommandPalette}
          onCreateTerminal={onCreateTerminal}
          onResizeStart={setResizeRightEdge}
          onSetMode={terminalStage.setMode}
          onSetFollowAgent={terminalStage.setFollowAgent}
          onFocusSession={handleFocusSession}
        />
      )}
      {workspacePresent && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整作战中心宽度"
          aria-hidden={!workspaceMotionOpen}
          aria-valuemin={MIN_TOPIC_WORKSPACE_WIDTH}
          aria-valuemax={MAX_TOPIC_WORKSPACE_WIDTH}
          aria-valuenow={Math.round(workspaceWidth)}
          tabIndex={workspaceMotionOpen ? 0 : -1}
          data-state={workspaceMotionOpen ? 'open' : 'closed'}
          data-resizing={isResizingWorkspace ? 'true' : 'false'}
          className="workspace-resize-handle no-drag hidden lg:block"
          onMouseDown={(event) => {
            if (!workspaceMotionOpen) return
            event.preventDefault()
            const workspacePanel = event.currentTarget.nextElementSibling as HTMLElement | null
            setWorkspaceResizeRightEdge(
              workspacePanel?.getBoundingClientRect().right ?? window.innerWidth
            )
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            setWorkspaceWidth(DEFAULT_TOPIC_WORKSPACE_WIDTH)
          }}
        />
      )}
      {workspacePresent && (
        <div
          className="topic-workspace-presence workspace-side-panel h-full shrink-0 overflow-hidden"
          data-state={workspaceMotionOpen ? 'open' : 'closed'}
          aria-hidden={!workspaceMotionOpen}
          style={{ width: workspaceWidth, maxWidth: workspaceWidth, flexBasis: workspaceWidth }}
        >
          <div
            className="topic-workspace-inner h-full"
            style={{ width: workspaceWidth, minWidth: workspaceWidth }}
          >
            <TopicHub
              topicId={topic.id}
              hosts={topicHosts}
              sessions={visibleSessions}
              onAddHost={onManageHosts}
              onRemoveHost={onRemoveHostFromTopic}
              onCreateTerminal={onCreateTerminal}
              onCloseTerminal={onCloseTerminal}
              onRenameTerminal={onRenameTerminal}
              onTogglePin={onToggleTerminalPin}
              focusedSessionId={terminalStage.focusedSessionId}
              onFocusSession={handleFocusSession}
              onOpenFileBrowser={onOpenFileBrowser}
              onOpenPortForward={(host) => setPortForwardHost({ id: host.id, alias: host.alias })}
              onOpenRunDetail={setRunDetailId}
            />
          </div>
        </div>
      )}
      {portForwardHost && (
        <Dialog open onOpenChange={(open) => !open && setPortForwardHost(null)}>
          <DialogContent className="h-[520px] max-w-2xl overflow-hidden p-0" showClose={false}>
            <PortForwardingPanel
              hostId={portForwardHost.id}
              hostAlias={portForwardHost.alias}
              onClose={() => setPortForwardHost(null)}
            />
          </DialogContent>
        </Dialog>
      )}
      <AgentRunDetailDrawer
        runId={runDetailId}
        open={!!runDetailId}
        onClose={() => setRunDetailId(null)}
        onRevealTerminal={terminalStage.revealTerminal}
      />
      {isResizing && (
        <div
          className="fixed inset-0 z-[100] cursor-col-resize select-none pointer-events-auto bg-transparent"
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => {
            const rightEdge = resizeRightEdge ?? window.innerWidth
            const panelLeft = panelRef.current?.getBoundingClientRect().left ?? 0
            const maxWidth = Math.max(
              MIN_TERMINAL_STAGE_WIDTH,
              rightEdge - panelLeft - MIN_CHAT_COLUMN_WIDTH
            )
            const nextWidth = Math.max(
              MIN_TERMINAL_STAGE_WIDTH,
              Math.min(rightEdge - e.clientX, maxWidth)
            )
            setTerminalWidth(nextWidth)
          }}
          onMouseUp={() => setResizeRightEdge(null)}
        />
      )}
      {isResizingWorkspace && (
        <div
          className="fixed inset-0 z-[100] cursor-col-resize select-none pointer-events-auto bg-transparent"
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => {
            const rightEdge = workspaceResizeRightEdge ?? window.innerWidth
            const panelLeft = panelRef.current?.getBoundingClientRect().left ?? 0
            const reservedWidth =
              MIN_CHAT_COLUMN_WIDTH + (visibleSessions.length > 0 ? terminalWidth : 0)
            const maxWidth = Math.min(
              MAX_TOPIC_WORKSPACE_WIDTH,
              Math.max(MIN_TOPIC_WORKSPACE_WIDTH, rightEdge - panelLeft - reservedWidth)
            )
            const nextWidth = clampPanelWidth(
              rightEdge - e.clientX,
              MIN_TOPIC_WORKSPACE_WIDTH,
              maxWidth
            )
            setWorkspaceWidth(nextWidth)
          }}
          onMouseUp={() => setWorkspaceResizeRightEdge(null)}
        />
      )}
    </div>
  )
}
