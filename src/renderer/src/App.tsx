import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus,
  LayoutGrid,
  MessageSquare,
  Settings,
  Search,
  Server,
  Trash2,
  ShieldAlert,
  Terminal as TerminalIcon,
  X,
  Eye,
  EyeOff,
  Bot,
  Send,
  User,
  Hash,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Zap,
  Clock,
  ArrowRight,
  Monitor,
  Minus,
  Pencil,
  Pause,
  Play,
  Command
} from 'lucide-react'
import { TerminalView } from './components/TerminalView'
import logo from './assets/logo.png'
import { AuthModal } from './components/AuthModal'
import { Host, Topic, Message } from '../../shared/types'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { SettingsPage } from './components/settings'
import { ModelSelector } from './components/ModelSelector'
import { useProvider } from './hooks/useProvider'
import { usePermissions } from './hooks/usePermissions'

type View = 'hosts' | 'terminal' | 'chat' | 'settings'

interface AgentTerminalSession {
  sessionId: string
  hostId: string
  hostAlias: string
  command?: string
  visible: boolean
  paused?: boolean
  commandStatus?: 'idle' | 'running' | 'completed' | 'failed'
  commandStartTime?: number
  commandExitCode?: number
  commandDurationMs?: number
}

interface CommandSuggestion {
  partial: string
  completion: string
}

interface DebugEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  timestamp: number
  category: string
  message: string
  data?: any
}

function CommandPalette({
  hostAlias,
  value,
  onChange,
  onClose,
  onSubmit
}: {
  hostAlias?: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white border border-gray-100 shadow-2xl p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Command size={18} />
          </div>
          <div>
            <h3 className="font-black text-gray-900">自然语言执行</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {hostAlias ? `当前目标终端：${hostAlias}` : '将使用当前话题上下文交给 Agent 处理'}
            </p>
          </div>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="例如：检查服务状态，如果没启动就重启并查看最近日志"
          className="w-full h-36 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300"
        />

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">`Cmd/Ctrl + Enter` 立即执行</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              onClick={onSubmit}
              disabled={!value.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              交给 Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddHostModal({ onClose, onSave }: { onClose: () => void; onSave: (host: any) => void }) {
  const [form, setForm] = useState({
    alias: '',
    ip: '',
    port: '22',
    username: 'root',
    password: '',
    keyPath: ''
  })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.alias || !form.ip || !form.username) {
      setError('别名、IP 和用户名是必填项。')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...form, port: parseInt(form.port) || 22, tags: [] })
      onClose()
    } catch (e: any) {
      setError(e.message || '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-8 mx-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Server size={20} />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-lg leading-none">添加新主机</h2>
              <p className="text-xs text-gray-400 mt-0.5">配置 SSH 终点</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Alias
              </label>
              <input
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="e.g. prod-server"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Username
              </label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="root"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                IP Address
              </label>
              <input
                value={form.ip}
                onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                placeholder="192.168.1.100"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Port
              </label>
              <input
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                placeholder="22"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Optional - leave blank to use SSH key"
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              SSH Key Path
            </label>
            <input
              value={form.keyPath}
              onChange={(e) => setForm((f) => ({ ...f, keyPath: e.target.value }))}
              placeholder="~/.ssh/id_rsa (optional)"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition font-mono"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60 transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              '正在保存...'
            ) : (
              <>
                <Plus size={16} /> 保存主机
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function HostCard({
  host,
  onConnect,
  onDelete,
  onAgentClick
}: {
  host: Host
  onConnect: () => void
  onDelete: () => void
  onAgentClick: () => void
}) {
  return (
    <div className="group relative bg-white rounded-3xl p-7 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-100 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-3xl" />

      <button
        onClick={onDelete}
        className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
      >
        <Trash2 size={14} />
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
          <Server size={26} />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="text-base font-black text-gray-900 truncate" title={host.alias}>
            {host.alias}
          </h3>
          <span
            className="text-xs font-mono text-gray-400 truncate block"
            title={`${host.username}@${host.ip}:${host.port || 22}`}
          >
            {host.username}@{host.ip}:{host.port || 22}
          </span>
        </div>
      </div>

      {host.tags && host.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {host.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full uppercase tracking-widest"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2.5 mt-auto">
        <button
          onClick={onConnect}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-700 transition active:scale-95"
        >
          <TerminalIcon size={13} /> 终端
        </button>
        <button
          onClick={onAgentClick}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition active:scale-95 shadow-md shadow-blue-500/20"
        >
          <Zap size={13} /> 助手
        </button>
      </div>
    </div>
  )
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all group ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
          : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm hover:border hover:border-gray-100'
      }`}
    >
      <span
        className={active ? 'text-white' : 'text-gray-400 group-hover:text-blue-500 transition'}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span
          className={`text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function ChatPanel({
  topic,
  hosts,
  prefill,
  onManageHosts,
  agentSessions,
  onCloseAgentTerminal,
  onToggleAgentTerminalPaused
}: {
  topic: Topic
  hosts: Host[]
  prefill?: string
  onManageHosts: () => void
  agentSessions: AgentTerminalSession[]
  onCloseAgentTerminal: (sessionId: string) => void
  onToggleAgentTerminalPaused: (sessionId: string, paused: boolean) => Promise<void>
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState(prefill || '')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})
  const [topicHosts, setTopicHosts] = useState<Host[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [commandAssistEnabled, setCommandAssistEnabled] = useState(true)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteValue, setCommandPaletteValue] = useState('')
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [commandSuggestions, setCommandSuggestions] = useState<
    Record<string, CommandSuggestion | null>
  >({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const { providers, models } = useProvider()

  const filteredHosts = hosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(mentionFilter.toLowerCase()) || h.ip.includes(mentionFilter)
  )

  useEffect(() => {
    const topicHostList = hosts.filter((h) => topic.hostIds.includes(h.id))
    setTopicHosts(topicHostList)
  }, [topic.hostIds, hosts])

  useEffect(() => {
    const fetchHistory = async () => {
      const history = await window.api.getMessages(topic.id)
      setMessages(history)
    }
    fetchHistory()

    const unlistenStep = window.api.onAgentStep((step) => {
      if (step.topicId === topic.id) {
        setMessages((prev) => {
          const exists = prev.find((m) => m.id === step.id)
          if (exists) return prev.map((m) => (m.id === step.id ? step : m))
          return [...prev, step]
        })
      }
    })
    return () => unlistenStep()
  }, [topic.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    const lastWord = value.split(' ').pop() || ''
    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1))
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (host: Host) => {
    const parts = inputValue.split(' ')
    parts.pop()
    setInputValue([...parts, `@${host.alias} `].join(' '))
    setShowMentions(false)
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isThinking) return
    const userContent = inputValue
    const userMsg: Message = {
      id: Date.now().toString(),
      topicId: topic.id,
      role: 'user',
      content: userContent,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setIsThinking(true)
    try {
      const response = await window.api.sendMessage(topic.id, userContent)
      setMessages((prev) => [...prev, response])
    } catch (err) {
      console.error('Agent error:', err)
      const errMsg: Message = {
        id: Date.now().toString(),
        topicId: topic.id,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please check connectivity and try again.',
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setIsThinking(false)
    }
  }

  const visibleSessions = agentSessions.filter((session) => session.visible)
  const focusedSession =
    visibleSessions.find((session) => session.sessionId === focusedSessionId) || visibleSessions[0]

  useEffect(() => {
    if (visibleSessions.length === 0) {
      setFocusedSessionId(null)
      return
    }

    if (
      !focusedSessionId ||
      !visibleSessions.some((session) => session.sessionId === focusedSessionId)
    ) {
      setFocusedSessionId(visibleSessions[0].sessionId)
    }
  }, [focusedSessionId, visibleSessions])

  const openCommandPalette = () => {
    if (visibleSessions.length > 0 && !focusedSession) {
      setFocusedSessionId(visibleSessions[0].sessionId)
    }
    setCommandPaletteOpen(true)
  }

  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId)
  }, [])

  const handleSuggestionChange = useCallback((sessionId: string, suggestion: CommandSuggestion | null) => {
    setCommandSuggestions((prev) => ({ ...prev, [sessionId]: suggestion }))
  }, [])

  const handleSubmitCommandPalette = async () => {
    if (!commandPaletteValue.trim()) return

    const hostPrefix = focusedSession ? `@${focusedSession.hostAlias} ` : ''
    const naturalLanguagePrompt = `${hostPrefix}${commandPaletteValue.trim()}`
    setCommandPaletteOpen(false)
    setCommandPaletteValue('')
    setInputValue('')
    setIsThinking(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      topicId: topic.id,
      role: 'user',
      content: naturalLanguagePrompt,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const response = await window.api.sendMessage(topic.id, naturalLanguagePrompt)
      setMessages((prev) => [...prev, response])
    } catch (error) {
      console.error('Command palette agent error:', error)
    } finally {
      setIsThinking(false)
    }
  }

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
          <ModelSelector
            providers={providers}
            models={models}
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            onSelect={(providerId, modelId) => {
              setSelectedProviderId(providerId)
              setSelectedModelId(modelId)
            }}
            disabled={isThinking}
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
          <button
            onClick={onManageHosts}
            className="p-2 bg-gray-100 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl transition"
            title="管理主机"
          >
            <Server size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-xs mx-auto space-y-5">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500 rounded-3xl flex items-center justify-center shadow-sm">
                <Bot size={30} />
              </div>
              <div>
                <h3 className="font-black text-gray-900">准备就绪</h3>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                  描述您想执行的操作。使用 <span className="font-bold text-blue-500">@别名</span>{' '}
                  来指定特定主机。
                </p>
              </div>
              {topicHosts.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {topicHosts.slice(0, 3).map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setInputValue(`@${h.alias} `)}
                      className="px-3 py-1.5 border border-blue-100 bg-blue-50 text-blue-600 text-xs font-bold rounded-full hover:bg-blue-100 transition"
                    >
                      @{h.alias}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2.5`}
              >
                <div
                  className={`w-8 h-8 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  {msg.thought && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedThoughts((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                        className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-black text-amber-600 uppercase tracking-widest hover:bg-amber-100/50 transition w-full"
                      >
                        {expandedThoughts[msg.id] ? (
                          <ChevronDown size={11} />
                        ) : (
                          <ChevronRight size={11} />
                        )}
                        <Zap size={11} />
                        助手推理
                      </button>
                      {expandedThoughts[msg.id] && (
                        <div className="px-4 pb-3 text-xs text-amber-800/80 italic leading-relaxed border-t border-amber-100">
                          {msg.thought}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.toolCalls.map((tool) => {
                        let cmd = ''
                        try {
                          cmd = JSON.parse(tool.function.arguments).command
                        } catch {}
                        return (
                          <div
                            key={tool.id}
                            className="flex items-center gap-2.5 text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3.5 py-2 rounded-xl"
                          >
                            <TerminalIcon size={11} className="text-emerald-500 flex-shrink-0" />
                            <span className="truncate">{cmd || tool.function.name}</span>
                            <CheckCircle2
                              size={11}
                              className="ml-auto text-emerald-500 flex-shrink-0"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div
                    className={`px-5 py-3.5 text-sm leading-relaxed rounded-2xl shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : msg.role === 'tool'
                          ? 'bg-gray-900 text-emerald-400 font-mono text-[11px] border border-gray-800 rounded-bl-sm max-w-full overflow-x-auto shadow-xl'
                          : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : msg.role === 'tool' ? (
                      <div>{msg.content}</div>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="flex items-end gap-2.5">
                <div className="w-8 h-8 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center animate-pulse">
                  <Bot size={14} />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:300ms]"></span>
                  </div>
                  <span className="text-[10px] font-black text-blue-600/50 uppercase tracking-widest ml-1">
                    Analyzing
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {visibleSessions.length > 0 && (
          <div className="w-[min(52vw,56rem)] border-l border-gray-100 bg-gray-50 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                  <Monitor size={12} />
                  共驾终端
                </h3>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                  {visibleSessions.length} 个活动终端
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-gray-900">
                    {focusedSession ? focusedSession.hostAlias : '未选择终端'}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {focusedSession
                      ? focusedSession.paused
                        ? '当前由人工接管，Agent 已暂停'
                        : '当前由 Agent 驱动，可随时接管'
                      : '点击任一终端后即可接管或自然语言下达指令'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setCommandAssistEnabled((value) => !value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${
                      commandAssistEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}
                    title="终端中按 Tab 使用 Agent 补全当前命令"
                  >
                    Tab补全
                  </button>
                  <button
                    onClick={openCommandPalette}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition bg-gray-900 text-white hover:bg-black"
                    title="Command+K"
                  >
                    Cmd+K
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`flex-1 min-h-0 overflow-y-auto p-3 grid gap-3 auto-rows-fr ${visibleSessions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
            >
              {visibleSessions.map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => setFocusedSessionId(session.sessionId)}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition cursor-pointer flex flex-col ${focusedSession?.sessionId === session.sessionId ? 'border-blue-300 ring-2 ring-blue-100 shadow-blue-100/70' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div
                    className={`px-3 py-2.5 text-white flex items-center justify-between gap-2 ${focusedSession?.sessionId === session.sessionId ? 'bg-slate-950' : 'bg-gray-900'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 shrink">
                      <TerminalIcon
                        size={12}
                        className={session.paused ? 'text-amber-300' : 'text-emerald-400'}
                      />
                      <span className="text-xs font-bold truncate">{session.hostAlias}</span>
                      {focusedSession?.sessionId === session.sessionId && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-blue-100">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          onToggleAgentTerminalPaused(session.sessionId, !session.paused)
                        }
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                          session.paused
                            ? 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
                        }`}
                        title={session.paused ? '恢复 Agent 控制' : '暂停 Agent，人工接管'}
                      >
                        {session.paused ? <Play size={12} /> : <Pause size={12} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onCloseAgentTerminal(session.sessionId)
                        }}
                        className="p-1 hover:bg-gray-700 rounded transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  {session.commandStatus === 'running' && (
                    <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          <span className="text-[11px] font-bold text-blue-700">
                            {session.command}
                          </span>
                          <span className="text-[10px] text-blue-500">
                            {session.commandStartTime
                              ? `${Math.floor((Date.now() - session.commandStartTime) / 1000)}s`
                              : ''}
                          </span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-medium">执行中...</span>
                      </div>
                    </div>
                  )}
                  {session.commandStatus === 'completed' && (
                    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                          <span className="text-[11px] font-bold text-emerald-700">
                            {session.command}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-600">
                          exit {session.commandExitCode} · {session.commandDurationMs}ms
                        </span>
                      </div>
                    </div>
                  )}
                  {session.commandStatus === 'failed' && (
                    <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-500 rounded-full" />
                          <span className="text-[11px] font-bold text-red-700">
                            {session.command}
                          </span>
                        </div>
                        <span className="text-[10px] text-red-600">
                          exit {session.commandExitCode} · {session.commandDurationMs}ms
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 min-h-0 bg-[#1a1b1e] relative">
                    <TerminalView
                      sessionId={session.sessionId}
                      topicId={topic.id}
                      hostId={session.hostId}
                      commandAssistEnabled={commandAssistEnabled}
                      onFocusSession={() => handleFocusSession(session.sessionId)}
                      onSuggestionChange={(suggestion) =>
                        handleSuggestionChange(session.sessionId, suggestion)
                      }
                      onClose={onCloseAgentTerminal ? () => onCloseAgentTerminal(session.sessionId) : () => {}}
                    />
                    {session.paused && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-black shadow-sm">
                        人工接管中
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span
                        className={`font-black ${session.paused ? 'text-amber-600' : 'text-emerald-600'}`}
                      >
                        {session.paused ? '键盘已交给你' : 'Agent 正在控制'}
                      </span>
                      <span className="text-gray-400">
                        {focusedSession?.sessionId === session.sessionId
                          ? 'Cmd+K 将作用于此终端'
                          : '点击以选中'}
                      </span>
                    </div>
                    <code className="text-[10px] font-mono text-gray-600 truncate block bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                      {session.command}
                    </code>
                    {commandSuggestions[session.sessionId] && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                        <div className="text-[10px] font-black text-blue-600">Tab 建议</div>
                        <code className="mt-1 block text-[10px] font-mono text-blue-900 break-all">
                          {commandSuggestions[session.sessionId]?.completion}
                        </code>
                        <div className="mt-1 text-[10px] text-blue-500">
                          再按一次 `Tab` 接受建议
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-gray-400">
                        {commandAssistEnabled ? 'Tab 补全已启用' : 'Tab 补全已关闭'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setFocusedSessionId(session.sessionId)
                          openCommandPalette()
                        }}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition ${
                          focusedSession?.sessionId === session.sessionId
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        自然语言执行
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-7 py-5 border-t border-gray-100 relative">
        {showMentions && filteredHosts.length > 0 && (
          <div className="absolute bottom-full left-7 mb-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-10">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <Hash size={10} /> 提及主机
            </div>
            {filteredHosts.map((host) => (
              <button
                key={host.id}
                className="w-full px-4 py-3 hover:bg-blue-50 flex items-center gap-3 text-left transition"
                onClick={() => insertMention(host)}
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
                  <Server size={15} />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{host.alias}</div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    {host.ip}:{host.port || 22}
                  </div>
                </div>
                <ArrowRight size={14} className="ml-auto text-gray-300" />
              </button>
            ))}
          </div>
        )}

        <div
          className={`flex items-center gap-3 bg-gray-50 border rounded-2xl px-3 py-2 transition-all ${isThinking ? 'opacity-60' : 'focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50 border-gray-200'}`}
        >
          <input
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={isThinking}
            placeholder={isThinking ? '助手正在工作中...' : '给助手发送消息或输入 @ 来指定主机...'}
            className="flex-1 bg-transparent px-2 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed font-medium"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isThinking}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {commandPaletteOpen && (
        <CommandPalette
          hostAlias={focusedSession?.hostAlias}
          value={commandPaletteValue}
          onChange={setCommandPaletteValue}
          onClose={() => setCommandPaletteOpen(false)}
          onSubmit={handleSubmitCommandPalette}
        />
      )}
    </div>
  )
}

function ManageHostsModal({
  topic,
  allHosts,
  onClose,
  onAddHost,
  onRemoveHost
}: {
  topic: Topic
  allHosts: Host[]
  onClose: () => void
  onAddHost: (hostId: string) => void
  onRemoveHost: (hostId: string) => void
}) {
  const topicHosts = allHosts.filter((h) => topic.hostIds.includes(h.id))
  const availableHosts = allHosts.filter((h) => !topic.hostIds.includes(h.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg p-8 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-black text-gray-900 text-lg">管理话题主机</h2>
            <p className="text-xs text-gray-400 mt-0.5">添加或移除此话题中的主机</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
              已连接主机
            </h3>
            {topicHosts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">暂无主机</p>
            ) : (
              <div className="space-y-2">
                {topicHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <Server size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{host.alias}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {host.ip}:{host.port || 22}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveHost(host.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                    >
                      <Minus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableHosts.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                可用主机
              </h3>
              <div className="space-y-2">
                {availableHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center">
                        <Server size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{host.alias}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {host.ip}:{host.port || 22}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onAddHost(host.id)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('hosts')
  const [hosts, setHosts] = useState<Host[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedHost, setSelectedHost] = useState<Host | null>(null)
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [showAddHost, setShowAddHost] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingAuth, setPendingAuth] = useState<{ requestId: string; command: string } | null>(
    null
  )
  const [prefilledText, setPrefilledText] = useState('')
  const [agentSessions, setAgentSessions] = useState<AgentTerminalSession[]>([])
  const [showManageHosts, setShowManageHosts] = useState(false)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingTopicTitle, setEditingTopicTitle] = useState('')
  const [debugLogs, setDebugLogs] = useState<DebugEntry[]>([])
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    const unlisten = window.api.onDebugLog((entry: DebugEntry) => {
      setDebugLogs((prev) => [entry, ...prev].slice(0, 100))
    })

    const handleDebugKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setShowDebug((v) => !v)
      }
    }

    window.addEventListener('keydown', handleDebugKey)
    return () => {
      if (unlisten) unlisten()
      window.removeEventListener('keydown', handleDebugKey)
    }
  }, [])

  const { requireConfirmation } = usePermissions()

  useEffect(() => {
    loadData()
    const unlistenAuth = window.api.onAgentAuthRequest((requestId, command) =>
      setPendingAuth({ requestId, command })
    )
    const unlistenTopic = window.api.onTopicUpdated(({ topicId, title }) => {
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, title } : t)))
      if (selectedTopic?.id === topicId) {
        setSelectedTopic((prev) => (prev ? { ...prev, title } : null))
      }
    })

    const unlistenTerminalShow = window.api.onAgentTerminalShow((data) => {
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.sessionId === data.sessionId)
        if (exists) {
          return prev.map((s) =>
            s.sessionId === data.sessionId
              ? { ...s, ...data, visible: true, paused: s.paused ?? false }
              : s
          )
        }
        return [...prev, { ...data, visible: true, paused: false }]
      })
    })

    const unlistenTerminalHide = window.api.onAgentTerminalHide(({ sessionId }) => {
      setAgentSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, visible: false } : s))
      )
    })

    const unlistenSessionCreated = window.api.onAgentSessionCreated((data) => {
      setAgentSessions((prev) => {
        const exists = prev.find((s) => s.sessionId === data.sessionId)
        if (exists) return prev
        return [...prev, { ...data, visible: true, paused: false }]
      })
    })

    return () => {
      unlistenAuth()
      unlistenTopic()
      unlistenTerminalShow()
      unlistenTerminalHide()
      unlistenSessionCreated()
    }
  }, [selectedTopic])

  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    agentSessions.forEach((session) => {
      // Use a set to track which sessions we already have listeners for if needed,
      // but for now, we'll just ensure this effect is more targeted.
      const unsubStart = window.api.onTerminalCommandStart(session.sessionId, (data) => {
        setAgentSessions((prev) =>
          prev.map((s) =>
            s.sessionId === session.sessionId
              ? {
                  ...s,
                  command: data.command,
                  commandStatus: 'running',
                  commandStartTime: Date.now(),
                  commandExitCode: undefined,
                  commandDurationMs: undefined
                }
              : s
          )
        )
      })

      const unsubEnd = window.api.onTerminalCommandEnd(session.sessionId, (data) => {
        setAgentSessions((prev) =>
          prev.map((s) =>
            s.sessionId === session.sessionId
              ? {
                  ...s,
                  commandStatus: data.exitCode === 0 ? 'completed' : 'failed',
                  commandExitCode: data.exitCode,
                  commandDurationMs: data.durationMs
                }
              : s
          )
        )
      })

      unsubscribers.push(unsubStart, unsubEnd)
    })

    return () => {
      unsubscribers.forEach((fn) => fn())
    }
  }, [agentSessions.map((s) => s.sessionId).join(',')])

  const loadData = async () => {
    const [loadedHosts, loadedTopics] = await Promise.all([
      window.api.getHosts(),
      window.api.getTopics()
    ])
    setHosts(loadedHosts)
    setTopics(loadedTopics)
  }

  const handleCreateHost = async (hostData: any) => {
    const newHost = await window.api.createHost(hostData)
    setHosts((prev) => [newHost, ...prev])
  }

  const handleDeleteHost = async (id: string) => {
    await window.api.deleteHost(id)
    setHosts((prev) => prev.filter((h) => h.id !== id))
  }

  const handleCreateTopic = async (initialText?: string) => {
    const title = `Session ${topics.length + 1}`
    const topic = await window.api.createTopic(title, [])
    setTopics((prev) => [topic, ...prev])
    setSelectedTopic(topic)
    setPrefilledText(initialText || '')
    setActiveView('chat')
  }

  const handleStartRenameTopic = (topic: Topic) => {
    setEditingTopicId(topic.id)
    setEditingTopicTitle(topic.title)
  }

  const handleCommitRenameTopic = async () => {
    if (!editingTopicId) return
    const trimmedTitle = editingTopicTitle.trim()
    if (!trimmedTitle) {
      setEditingTopicId(null)
      setEditingTopicTitle('')
      return
    }

    await window.api.updateTopicTitle(editingTopicId, trimmedTitle)
    setTopics((prev) =>
      prev.map((topic) => (topic.id === editingTopicId ? { ...topic, title: trimmedTitle } : topic))
    )
    setSelectedTopic((prev) =>
      prev && prev.id === editingTopicId ? { ...prev, title: trimmedTitle } : prev
    )
    setEditingTopicId(null)
    setEditingTopicTitle('')
  }

  const handleDeleteTopic = async (topicId: string) => {
    await window.api.deleteTopic(topicId)
    const remainingTopics = topics.filter((topic) => topic.id !== topicId)
    setTopics(remainingTopics)

    if (selectedTopic?.id === topicId) {
      setSelectedTopic(remainingTopics[0] || null)
    }
  }

  const handleResolveAuth = async (approved: boolean) => {
    if (pendingAuth) {
      await window.api.sendAgentAuthResponse(pendingAuth.requestId, approved)
      setPendingAuth(null)
    }
  }

  const handleAddHostToTopic = async (hostId: string) => {
    if (!selectedTopic) return
    await window.api.addHostToTopic(selectedTopic.id, hostId)
    setTopics((prev) =>
      prev.map((t) => (t.id === selectedTopic.id ? { ...t, hostIds: [...t.hostIds, hostId] } : t))
    )
    setSelectedTopic((prev) => (prev ? { ...prev, hostIds: [...prev.hostIds, hostId] } : null))
  }

  const handleRemoveHostFromTopic = async (hostId: string) => {
    if (!selectedTopic) return
    await window.api.removeHostFromTopic(selectedTopic.id, hostId)
    setTopics((prev) =>
      prev.map((t) =>
        t.id === selectedTopic.id ? { ...t, hostIds: t.hostIds.filter((id) => id !== hostId) } : t
      )
    )
    setSelectedTopic((prev) =>
      prev ? { ...prev, hostIds: prev.hostIds.filter((id) => id !== hostId) } : null
    )
  }

  const handleCloseAgentTerminal = (sessionId: string) => {
    setAgentSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
    window.api.closeAgentSSHSession(sessionId)
  }

  const handleToggleAgentTerminalPaused = async (sessionId: string, paused: boolean) => {
    await window.api.setAgentSessionPaused(sessionId, paused)
    setAgentSessions((prev) =>
      prev.map((session) => (session.sessionId === sessionId ? { ...session, paused } : session))
    )
  }

  const filteredHosts = hosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.ip.includes(searchQuery) ||
      h.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900">
      <aside className="w-72 bg-gray-50/80 border-r border-gray-100 flex flex-col no-drag">
        <div className="px-7 pt-8 pb-6 drag">
          <div className="flex items-center gap-3 no-drag">
            <div className="w-12 h-12 flex items-center justify-center -ml-1">
              <img src={logo} alt="OpenTerm Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-gray-900 leading-none">
                OpenTerm
              </h1>
            </div>
          </div>
        </div>

        <nav className="px-4 space-y-1">
          <NavItem
            active={activeView === 'hosts'}
            onClick={() => setActiveView('hosts')}
            icon={<LayoutGrid size={17} />}
            label="主机"
            count={hosts.length}
          />
          <NavItem
            active={activeView === 'chat'}
            onClick={() => {
              setActiveView('chat')
              if (!selectedTopic && topics.length > 0) setSelectedTopic(topics[0])
            }}
            icon={<MessageSquare size={17} />}
            label="Agent助手"
            count={topics.length}
          />
          <NavItem
            active={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
            icon={<Settings size={17} />}
            label="设置"
          />
        </nav>

        {activeView === 'chat' && (
          <div className="flex-1 overflow-y-auto px-4 mt-6">
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                会话
              </span>
              <button
                onClick={() => handleCreateTopic()}
                className="p-1.5 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600 transition border border-transparent hover:border-gray-200 hover:shadow-sm"
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="space-y-1">
              {topics.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-xs">
                  <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                  暂无会话
                </div>
              )}
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedTopic(topic)
                    setPrefilledText('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedTopic(topic)
                      setPrefilledText('')
                    }
                  }}
                  className={`group w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    selectedTopic?.id === topic.id
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-100'
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedTopic?.id === topic.id ? 'bg-blue-500' : 'bg-gray-300'}`}
                  />
                  {editingTopicId === topic.id ? (
                    <input
                      autoFocus
                      value={editingTopicTitle}
                      onChange={(e) => setEditingTopicTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={handleCommitRenameTopic}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCommitRenameTopic()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingTopicId(null)
                          setEditingTopicTitle('')
                        }
                      }}
                      className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-inherit"
                    />
                  ) : (
                    <span className="truncate flex-1">{topic.title}</span>
                  )}
                  {editingTopicId !== topic.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartRenameTopic(topic)
                        }}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                        title="重命名话题"
                      >
                        <Pencil size={12} />
                      </span>
                      <span
                        onClick={async (e) => {
                          e.stopPropagation()
                          await handleDeleteTopic(topic.id)
                        }}
                        className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                        title="删除话题"
                      >
                        <Trash2 size={12} />
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 mt-auto">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  requireConfirmation
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-yellow-50 text-yellow-600'
                }`}
              >
                <ShieldAlert size={15} />
              </div>
              <div>
                <div className="text-xs font-black text-gray-900">
                  {requireConfirmation ? '操作需确认' : '自动执行模式'}
                </div>
                <div className="text-[10px] text-gray-400">
                  {requireConfirmation ? '高危操作会询问您' : 'Agent 将直接执行'}
                </div>
              </div>
              <div
                className={`ml-auto w-2 h-2 rounded-full ${
                  requireConfirmation ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'
                }`}
              />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'hosts' && (
          <div className="flex-1 overflow-y-auto bg-gray-50/30">
            <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 px-10 py-5 flex items-center justify-between drag">
              <div className="no-drag">
                <h2 className="text-2xl font-black text-gray-900">主机</h2>
                <p className="text-sm text-gray-400 mt-0.5">管理您的远程 SSH 终点</p>
              </div>
              <div className="flex items-center gap-3 no-drag">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                  <Search size={15} className="text-gray-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-44 placeholder-gray-400"
                    placeholder="搜索主机..."
                  />
                </div>
                <button
                  onClick={() => setShowAddHost(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  <Plus size={16} /> 添加主机
                </button>
              </div>
            </div>

            <div className="px-10 py-8">
              {filteredHosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-gray-300 mb-5">
                    <Server size={36} />
                  </div>
                  <h3 className="font-black text-gray-900 text-lg">暂无主机</h3>
                  <p className="text-gray-400 text-sm mt-2 mb-6">添加您的第一个 SSH 服务器以开始</p>
                  <button
                    onClick={() => setShowAddHost(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
                  >
                    <Plus size={16} /> 添加第一个主机
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredHosts.map((host) => (
                    <HostCard
                      key={host.id}
                      host={host}
                      onConnect={async () => {
                        try {
                          const sessionId = await window.api.connectSSH(host.id)
                          setSelectedHost(host)
                          setTerminalSessionId(sessionId)
                          setActiveView('terminal')
                        } catch (e) {
                          console.error('SSH connection failed:', e)
                        }
                      }}
                      onAgentClick={() => handleCreateTopic(`@${host.alias} `)}
                      onDelete={() => handleDeleteHost(host.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'terminal' && selectedHost && terminalSessionId && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-11 bg-gray-900 text-white px-5 flex items-center justify-between border-b border-gray-800 flex-shrink-0 drag">
              <div className="flex items-center gap-3 no-drag">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                  <div className="w-3 h-3 bg-emerald-400 rounded-full" />
                </div>
                <div className="w-px h-4 bg-gray-700" />
                <TerminalIcon size={13} className="text-blue-400" />
                <span className="text-xs font-bold font-mono text-gray-300">
                  {selectedHost.alias}
                </span>
                <span className="text-[10px] text-gray-600 font-mono">
                  {selectedHost.username}@{selectedHost.ip}:{selectedHost.port || 22}
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveView('hosts')
                  setTerminalSessionId(null)
                }}
                className="text-[11px] bg-gray-800 hover:bg-red-900/60 text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
              >
                <X size={12} /> 断开连接
              </button>
            </div>
            <div className="flex-1 bg-[#1a1b1e]">
              <TerminalView
                sessionId={terminalSessionId}
                onClose={() => {
                  setActiveView('hosts')
                  setTerminalSessionId(null)
                }}
              />
            </div>
          </div>
        )}

        {activeView === 'chat' && selectedTopic && (
          <ChatPanel
            key={selectedTopic.id}
            topic={selectedTopic}
            hosts={hosts}
            prefill={prefilledText}
            onManageHosts={() => setShowManageHosts(true)}
            agentSessions={agentSessions}
            onCloseAgentTerminal={handleCloseAgentTerminal}
            onToggleAgentTerminalPaused={handleToggleAgentTerminalPaused}
          />
        )}

        {activeView === 'chat' && !selectedTopic && (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-gray-50/30">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
              <MessageSquare size={36} />
            </div>
            <h2 className="text-2xl font-black text-gray-900">Agent助手</h2>
            <p className="text-gray-400 text-sm mt-2 mb-8 max-w-xs">
              开启一个新的 AI 会话来自主管理您的基础设施。
            </p>
            <button
              onClick={() => handleCreateTopic()}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Plus size={18} /> 新建会话
            </button>
          </div>
        )}

        {activeView === 'settings' && <SettingsPage />}
      </main>

      {showAddHost && (
        <AddHostModal onClose={() => setShowAddHost(false)} onSave={handleCreateHost} />
      )}
      {pendingAuth && (
        <AuthModal
          requestId={pendingAuth.requestId}
          command={pendingAuth.command}
          onResolve={handleResolveAuth}
        />
      )}
      {showManageHosts && selectedTopic && (
        <ManageHostsModal
          topic={selectedTopic}
          allHosts={hosts}
          onClose={() => setShowManageHosts(false)}
          onAddHost={handleAddHostToTopic}
          onRemoveHost={handleRemoveHostFromTopic}
        />
      )}

      {showDebug && (
        <div className="fixed bottom-4 right-4 z-[9999] w-[400px] max-h-[500px] bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-blue-400" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest">系统调试信息</h3>
            </div>
            <button
              onClick={() => setShowDebug(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[10px]">
            {debugLogs.length === 0 && (
              <div className="text-gray-600 italic text-center py-10">等待日志输入...</div>
            )}
            {debugLogs.map((log, i) => (
              <div key={i} className="flex flex-col gap-1 border-l-2 border-gray-800 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                    log.level === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                    log.level === 'WARN' ? 'bg-amber-500/20 text-amber-400' :
                    log.level === 'DEBUG' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-blue-500/70">[{log.category}]</span>
                </div>
                <div className="text-gray-300 leading-relaxed break-words">{log.message}</div>
                {log.data && (
                  <pre className="text-gray-500 bg-black/30 p-2 rounded-lg mt-1 overflow-x-auto">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-black/40 border-t border-gray-800 flex justify-between">
            <span className="text-[9px] text-gray-500">显示最近 100 条日志</span>
            <button
              onClick={() => setDebugLogs([])}
              className="text-[9px] text-blue-500 hover:text-blue-400 font-bold"
            >
              清空日志
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
