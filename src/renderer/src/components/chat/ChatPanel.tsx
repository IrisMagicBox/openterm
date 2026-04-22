import { useState, useEffect, useMemo, useRef } from 'react'
import { Clock, Monitor, Cpu } from 'lucide-react'
import { TopicHub } from '../TopicHub'
import { Host, Topic, TerminalSession } from '../../../../shared/types'
import { AgentStepStream } from '../AgentStepStream'
import { AgentLiveStream } from '../AgentLiveStream'
import { ModelSelector } from '../ModelSelector'
import { ChatInput } from './ChatInput'
import { MessageBubble, ThinkingIndicator, EmptyState } from './MessageBubble'
import { CommandPalette } from './CommandPalette'
import { TerminalStage } from './TerminalStage'
import { useProvider } from '../../hooks/useProvider'
import { useVisibilityRestore } from '../../hooks/useVisibilityRestore'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useTerminalPreviews } from '../../hooks/useTerminalPreviews'
import { useTerminalStageState } from '../../hooks/useTerminalStageState'
import { deriveTerminalActivities } from '../../lib/terminal-stage'
import { Badge, PageHeader } from '../ui'

import { LOCAL_HOST } from '../../constants'

interface ChatPanelProps {
  topic: Topic
  hosts: Host[]
  prefill?: string
  thinking?: boolean
  onManageHosts: () => void
  agentSessions: TerminalSession[]
  onCloseAgentTerminal: (id: string) => void
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  terminalWidth: number
  setTerminalWidth: (w: number) => void
  terminalFontSize: number
  setTerminalFontSize: (s: number) => void
  onRemoveHostFromTopic: (id: string) => Promise<void>
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
  setTerminalFontSize,
  onRemoveHostFromTopic,
  onCreateTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onToggleTerminalPin,
  onUpdateModel
}: ChatPanelProps): React.ReactElement {
  const [inputValue, setInputValue] = useState(prefill || '')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { animationKey } = useVisibilityRestore()
  const { providers, models, defaultProviderId, defaultModelId } = useProvider()

  const selectedProviderId =
    topic.selectedProviderId || defaultProviderId || providers.find((p) => p.enabled)?.id || null
  const selectedModelId =
    topic.selectedModelId ||
    (selectedProviderId
      ? (defaultModelId &&
        models.some(
          (model) => model.id === defaultModelId && model.providerId === selectedProviderId
        )
          ? defaultModelId
          : models.find((model) => model.providerId === selectedProviderId)?.id) || null
      : null)
  const {
    messages,
    activeSteps,
    activeParts,
    messageQueue,
    expandedThoughts,
    sendMessage,
    toggleThought,
    removeQueuedMessage,
    clearQueue
  } = useChatMessages(topic.id, thinking)
  const visibleSessions = agentSessions.filter((s) => s.visible)
  const terminalPreviews = useTerminalPreviews(visibleSessions)
  const terminalStage = useTerminalStageState(visibleSessions, activeParts)
  const terminalActivities = useMemo(
    () => deriveTerminalActivities(visibleSessions, activeParts, terminalPreviews),
    [activeParts, terminalPreviews, visibleSessions]
  )
  const {
    commandPaletteOpen,
    commandPaletteValue,
    setCommandPaletteOpen,
    setCommandPaletteValue,
    openCommandPalette
  } = useCommandPalette()
  const realHosts = hosts.filter((h) => topic.hostIds.includes(h.id))
  const topicHosts = topic.hostIds.includes('local') ? [LOCAL_HOST, ...realHosts] : realHosts
  const filteredHosts = topicHosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(mentionFilter.toLowerCase()) || h.ip.includes(mentionFilter)
  )
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking, activeSteps, activeParts])

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
  const handleSubmitCommandPalette = async (): Promise<void> => {
    if (!commandPaletteValue.trim()) return
    const prefix = terminalStage.focusedSession ? `@${terminalStage.focusedSession.hostAlias} ` : ''
    setCommandPaletteOpen(false)
    setCommandPaletteValue('')
    setInputValue('')
    await sendMessage(`${prefix}${commandPaletteValue.trim()}`)
  }
  const handleFocusSession = (id: string): void =>
    terminalStage.focusSession(id, { userInitiated: true })

  return (
    <div className="flex h-full flex-col bg-transparent">
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
            {selectedProviderId &&
              selectedModelId &&
              (() => {
                const sp = providers.find((p) => p.id === selectedProviderId)
                const sm = models.find(
                  (m) => m.id === selectedModelId && m.providerId === selectedProviderId
                )
                return sp && sm ? (
                  <Badge variant="accent">
                    <Cpu size={13} />
                    <span>{sm.name}</span>
                    <span className="text-accent/70">{sp.name}</span>
                  </Badge>
                ) : null
              })()}
            <ModelSelector
              providers={providers}
              models={models}
              selectedProviderId={selectedProviderId}
              selectedModelId={selectedModelId}
              onSelect={(pid, mid) => {
                onUpdateModel(topic.id, pid, mid)
              }}
              disabled={thinking}
            />
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
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
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
            onCloseAgentTerminal={onCloseAgentTerminal}
            onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
            onCloseTerminal={onCloseTerminal}
            onOpenCommandPalette={openCommandPalette}
            onCreateTerminal={onCreateTerminal}
            onSetTerminalFontSize={setTerminalFontSize}
            onSetResizing={setIsResizing}
            onSetMode={terminalStage.setMode}
            onSetFollowAgent={terminalStage.setFollowAgent}
            onFocusSession={handleFocusSession}
            onRevealTerminal={terminalStage.revealTerminal}
          />
        )}
        <TopicHub
          topicId={topic.id}
          hosts={topicHosts}
          sessions={agentSessions}
          onAddHost={onManageHosts}
          onRemoveHost={onRemoveHostFromTopic}
          onCreateTerminal={onCreateTerminal}
          onCloseTerminal={onCloseTerminal}
          onRenameTerminal={onRenameTerminal}
          onTogglePin={onToggleTerminalPin}
          focusedSessionId={terminalStage.focusedSessionId}
          onFocusSession={handleFocusSession}
        />
      </div>

      <ChatInput
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onSend={handleSend}
        thinking={!!thinking}
        messageQueue={messageQueue}
        onRemoveFromQueue={removeQueuedMessage}
        onClearQueue={clearQueue}
        showMentions={showMentions}
        filteredHosts={filteredHosts}
        onInsertMention={insertMention}
      />
      {commandPaletteOpen && (
        <CommandPalette
          hostAlias={terminalStage.focusedSession?.hostAlias}
          value={commandPaletteValue}
          onChange={setCommandPaletteValue}
          onClose={() => setCommandPaletteOpen(false)}
          onSubmit={handleSubmitCommandPalette}
        />
      )}
      {isResizing && (
        <div
          className="fixed inset-0 z-[100] cursor-col-resize select-none pointer-events-auto bg-transparent"
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => {
            const w = window.innerWidth - e.clientX - 256
            setTerminalWidth(Math.max(360, Math.min(w, window.innerWidth - 700)))
          }}
          onMouseUp={() => setIsResizing(false)}
        />
      )}
    </div>
  )
}
