import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Clock, Monitor, PanelRightClose, PanelRightOpen } from 'lucide-react'
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
import { useProvider } from '../../hooks/useProvider'
import { isAgentRuntimeProvider, isAgentUsableModel } from '../../config/providers'
import { useVisibilityRestore } from '../../hooks/useVisibilityRestore'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useTerminalPreviews } from '../../hooks/useTerminalPreviews'
import { useTerminalStageState } from '../../hooks/useTerminalStageState'
import { deriveTerminalActivities } from '../../lib/terminal-stage'
import { getErrorMessage } from '../../../../shared/errors'
import { Badge, Dialog, DialogContent, IconButton, PageHeader, Tooltip } from '../ui'

import { LOCAL_HOST } from '../../constants'

const CHAT_ZOOM_STORAGE_KEY = 'openterm.chat.zoom'
const DEFAULT_CHAT_ZOOM = 1
const CHAT_BASE_FONT_SIZE = 14
const CHAT_ZOOM_STEP = 0.06
const MIN_CHAT_ZOOM = 0.25
const MAX_CHAT_ZOOM = 1.18
const MIN_TERMINAL_STAGE_WIDTH = 360
const MIN_CHAT_COLUMN_WIDTH = 420

function clampChatZoom(value: number): number {
  return Math.max(MIN_CHAT_ZOOM, Math.min(MAX_CHAT_ZOOM, value))
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

interface ChatPanelProps {
  topic: Topic
  hosts: Host[]
  prefill?: string
  thinking?: boolean
  onManageHosts: () => void
  agentSessions: TerminalSession[]
  onCloseAgentTerminal: (id: string) => void | Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
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
}

export function ChatPanel({
  topic,
  hosts,
  prefill,
  thinking,
  onManageHosts,
  agentSessions,
  onCloseAgentTerminal,
  onToggleAgentTerminalPaused,
  terminalWidth,
  setTerminalWidth,
  terminalFontSize,
  onRemoveHostFromTopic,
  onOpenFileBrowser,
  onCreateTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onToggleTerminalPin,
  onUpdateModel
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
    const stored = Number(window.localStorage.getItem(CHAT_ZOOM_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0 ? clampChatZoom(stored) : DEFAULT_CHAT_ZOOM
  })
  const [workspaceOpen, setWorkspaceOpen] = useState(
    () => window.localStorage.getItem('openterm.topicWorkspace.open') !== 'false'
  )
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking, activeSteps, activeParts])
  useEffect(() => {
    window.localStorage.setItem('openterm.topicWorkspace.open', String(workspaceOpen))
  }, [workspaceOpen])
  useEffect(() => {
    window.localStorage.setItem(CHAT_ZOOM_STORAGE_KEY, chatZoom.toFixed(2))
  }, [chatZoom])
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
    <div ref={panelRef} className="flex h-full flex-col bg-transparent">
      <PageHeader
        title={topic.title}
        dense
        description={
          <>
            <Clock size={12} />
            {messages.length > 0 ? `${messages.length} 条消息` : '暂无消息'}
          </>
        }
        actions={
          <>
            {visibleSessions.length > 0 && (
              <Badge variant="neutral" className="hidden lg:flex">
                <Monitor size={13} />
                <span>共驾终端 {visibleSessions.length}</span>
                {terminalStage.focusedSession && (
                  <span className="text-accent">
                    当前: {terminalStage.focusedSession.hostAlias}
                  </span>
                )}
              </Badge>
            )}
            {topicHosts.length > 0 && (
              <div className="flex -space-x-2">
                {topicHosts.slice(0, 4).map((h) => (
                  <div
                    key={h.id}
                    title={h.alias}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/80 bg-white/70 text-[11px] font-semibold text-accent shadow-sm ring-1 ring-accent/15 backdrop-blur-xl"
                  >
                    {h.alias.slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
            <Tooltip
              side="bottom"
              content={
                <span className="flex items-center gap-2">
                  切换作战中心
                  <kbd className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[10px]">
                    ⌥⌘B
                  </kbd>
                </span>
              }
            >
              <IconButton
                aria-label={workspaceOpen ? '隐藏作战中心' : '显示作战中心'}
                onClick={() => setWorkspaceOpen((open) => !open)}
                className="h-8 w-8 rounded-lg border border-black/[0.06] bg-white text-muted-foreground shadow-sm hover:bg-black/[0.02] hover:text-foreground"
              >
                {workspaceOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </IconButton>
            </Tooltip>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex min-w-0 flex-1 flex-col"
          onMouseEnter={() => {
            document.documentElement.dataset.zoomTarget = 'chat'
          }}
          onMouseLeave={() => {
            if (document.documentElement.dataset.zoomTarget === 'chat') {
              delete document.documentElement.dataset.zoomTarget
            }
          }}
        >
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
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
            />
          </div>
        </div>

        {visibleSessions.length > 0 && (
          <TerminalStage
            visibleSessions={visibleSessions}
            focusedSession={terminalStage.focusedSession}
            focusedSessionId={terminalStage.focusedSessionId}
            activeParts={activeParts}
            activities={terminalActivities}
            previews={terminalPreviews}
            mode={terminalStage.mode}
            followAgent={terminalStage.followAgent}
            focusedPartId={terminalStage.focusedPartId}
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
            onCloseAgentTerminal={onCloseAgentTerminal}
            onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
            onCloseTerminal={onCloseTerminal}
            onOpenCommandPalette={openTerminalCommandPalette}
            onCreateTerminal={onCreateTerminal}
            onResizeStart={setResizeRightEdge}
            onSetMode={terminalStage.setMode}
            onSetFollowAgent={terminalStage.setFollowAgent}
            onFocusSession={handleFocusSession}
            onRevealTerminal={terminalStage.revealTerminal}
            onOpenPortForward={(session) =>
              setPortForwardHost({ id: session.hostId, alias: session.hostAlias })
            }
          />
        )}
        {workspaceOpen && (
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
        )}
      </div>

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
    </div>
  )
}
