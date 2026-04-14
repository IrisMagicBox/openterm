import { useState, useEffect, useRef } from 'react'
import { Clock, Monitor, Cpu } from 'lucide-react'
import { TopicHub } from '../TopicHub'
import { Host, Topic, TerminalSession } from '../../../../shared/types'
import { AgentStepStream } from '../AgentStepStream'
import { ModelSelector } from '../ModelSelector'
import { ChatInput } from './ChatInput'
import { MessageBubble, ThinkingIndicator, EmptyState } from './MessageBubble'
import { CommandPalette } from './CommandPalette'
import { TerminalSessionGrid } from './TerminalSessionGrid'
import { useProvider } from '../../hooks/useProvider'
import { useVisibilityRestore } from '../../hooks/useVisibilityRestore'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useCommandPalette } from '../../hooks/useCommandPalette'

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
}: ChatPanelProps) {
  console.log('[ChatPanel] Rendering with topic:', topic?.id, topic?.title)
  if (!topic) {
    console.warn('[ChatPanel] NO TOPIC PASSED!')
    return null
  }
  const [inputValue, setInputValue] = useState(prefill || '')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [topicHosts, setTopicHosts] = useState<Host[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { animationKey } = useVisibilityRestore()
  const { providers, models, defaultProviderId, defaultModelId } = useProvider()

  useEffect(() => {
    // Priority: 1. Topic settings 2. Explicitly selected 3. Global defaults
    if (topic.selectedProviderId && topic.selectedModelId) {
      setSelectedProviderId(topic.selectedProviderId)
      setSelectedModelId(topic.selectedModelId)
      return
    }

    if (selectedProviderId) return
    const targetPid = defaultProviderId || providers.find((p) => p.enabled)?.id
    if (!targetPid) return
    setSelectedProviderId(targetPid)
    const targetMid = defaultModelId || models.find((m) => m.providerId === targetPid)?.id
    if (targetMid) setSelectedModelId(targetMid)
  }, [topic.id, providers, models, defaultProviderId, defaultModelId])
  const {
    messages,
    activeSteps,
    messageQueue,
    expandedThoughts,
    sendMessage,
    toggleThought,
    removeQueuedMessage,
    clearQueue
  } = useChatMessages(topic.id, thinking)
  const visibleSessions = agentSessions.filter((s) => s.visible)
  const {
    commandPaletteOpen,
    commandPaletteValue,
    focusedSessionId,
    focusedSession,
    setCommandPaletteOpen,
    setCommandPaletteValue,
    setFocusedSessionId,
    openCommandPalette
  } = useCommandPalette(visibleSessions)
  const filteredHosts = topicHosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(mentionFilter.toLowerCase()) || h.ip.includes(mentionFilter)
  )

  useEffect(() => {
    const realHosts = hosts.filter((h) => topic.hostIds.includes(h.id))
    const includesLocal = topic.hostIds.includes('local')
    setTopicHosts(includesLocal ? [LOCAL_HOST, ...realHosts] : realHosts)
  }, [topic.hostIds, hosts])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    const lastWord = value.split(' ').pop() || ''
    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1))
    } else setShowMentions(false)
  }
  const insertMention = (host: Host) => {
    const parts = inputValue.split(' ')
    parts.pop()
    setInputValue([...parts, `@${host.alias} `].join(' '))
    setShowMentions(false)
  }
  const handleSend = async () => {
    if (!inputValue.trim()) return
    const c = inputValue
    setInputValue('')
    await sendMessage(c)
  }
  const handleSubmitCommandPalette = async () => {
    if (!commandPaletteValue.trim()) return
    const prefix = focusedSession ? `@${focusedSession.hostAlias} ` : ''
    setCommandPaletteOpen(false)
    setCommandPaletteValue('')
    setInputValue('')
    await sendMessage(`${prefix}${commandPaletteValue.trim()}`)
  }
  const handleFocusSession = (id: string) => setFocusedSessionId(id)

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between drag">
        <div className="no-drag">
          <h2 className="font-black text-gray-900">{topic.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={11} />
            {messages.length > 0 ? `${messages.length} 条消息` : '暂无消息'}
          </p>
        </div>
        <div className="flex items-center gap-3 no-drag">
          {visibleSessions.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <Monitor size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-600">
                共驾终端 {visibleSessions.length}
              </span>
              {focusedSession && (
                <span className="text-[11px] text-blue-600 font-bold">
                  当前: {focusedSession.hostAlias}
                </span>
              )}
            </div>
          )}
          {selectedProviderId &&
            selectedModelId &&
            (() => {
              const sp = providers.find((p) => p.id === selectedProviderId)
              const sm = models.find(
                (m) => m.id === selectedModelId && m.providerId === selectedProviderId
              )
              return sp && sm ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
                  <Cpu size={13} className="text-blue-500" />
                  <span className="text-xs font-bold text-blue-700">{sm.name}</span>
                  <span className="text-[10px] text-blue-400">{sp.name}</span>
                </div>
              ) : null
            })()}
          <ModelSelector
            providers={providers}
            models={models}
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            onSelect={(pid, mid) => {
              setSelectedProviderId(pid)
              setSelectedModelId(mid)
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
                  className="w-8 h-8 bg-blue-100 text-blue-600 text-[10px] font-black rounded-full border-2 border-white flex items-center justify-center ring-1 ring-blue-200"
                >
                  {h.alias.slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
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
          {thinking && activeSteps.length > 0 && <AgentStepStream steps={activeSteps} />}
          {thinking && activeSteps.length === 0 && (
            <ThinkingIndicator animationKey={animationKey} />
          )}
        </div>

        {visibleSessions.length > 0 && (
          <TerminalSessionGrid
            visibleSessions={visibleSessions}
            focusedSession={focusedSession}
            focusedSessionId={focusedSessionId}
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
            onSetFocusedSessionId={setFocusedSessionId}
            onFocusSession={handleFocusSession}
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
          focusedSessionId={focusedSessionId}
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
          hostAlias={focusedSession?.hostAlias}
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
            setTerminalWidth(Math.max(300, Math.min(w, window.innerWidth - 700)))
          }}
          onMouseUp={() => setIsResizing(false)}
        />
      )}
    </div>
  )
}
