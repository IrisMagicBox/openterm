import { useState, useEffect, useRef } from 'react'
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
  Minus
} from 'lucide-react'
import { TerminalView } from './components/TerminalView'
import { AuthModal } from './components/AuthModal'
import { Host, Topic, Message } from '../../shared/types'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { SettingsPage } from './components/settings'
import { ModelSelector } from './components/ModelSelector'
import { useProvider } from './hooks/useProvider'

type View = 'hosts' | 'terminal' | 'chat' | 'settings'

interface AgentTerminalSession {
  sessionId: string
  hostId: string
  hostAlias: string
  command: string
  visible: boolean
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
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-gray-900 truncate">{host.alias}</h3>
          <span className="text-xs font-mono text-gray-400">
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
  onCloseAgentTerminal
}: {
  topic: Topic
  hosts: Host[]
  prefill?: string
  onManageHosts: () => void
  agentSessions: AgentTerminalSession[]
  onCloseAgentTerminal: (sessionId: string) => void
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

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-black text-gray-900">{topic.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={11} />
            {messages.length > 0 ? `${messages.length} 条消息` : '暂无消息'}
          </p>
        </div>
        <div className="flex items-center gap-3">
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

        {agentSessions.filter((s) => s.visible).length > 0 && (
          <div className="w-96 border-l border-gray-100 bg-gray-50 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-white">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <Monitor size={12} />
                执行中终端
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {agentSessions
                .filter((s) => s.visible)
                .map((session) => (
                  <div
                    key={session.sessionId}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
                  >
                    <div className="px-3 py-2 bg-gray-900 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TerminalIcon size={12} className="text-emerald-400" />
                        <span className="text-xs font-bold">{session.hostAlias}</span>
                      </div>
                      <button
                        onClick={() => onCloseAgentTerminal(session.sessionId)}
                        className="p-1 hover:bg-gray-700 rounded transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="h-48 bg-[#1a1b1e]">
                      <TerminalView sessionId={session.sessionId} onClose={() => {}} />
                    </div>
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                      <code className="text-[10px] font-mono text-gray-600 truncate block">
                        {session.command}
                      </code>
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
            s.sessionId === data.sessionId ? { ...s, ...data, visible: true } : s
          )
        }
        return [...prev, { ...data, visible: true }]
      })
    })

    const unlistenTerminalHide = window.api.onAgentTerminalHide(({ sessionId }) => {
      setAgentSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, visible: false } : s))
      )
    })

    const unlistenSessionCreated = window.api.onAgentSessionCreated((data) => {
      console.log('Agent session created:', data)
    })

    return () => {
      unlistenAuth()
      unlistenTopic()
      unlistenTerminalShow()
      unlistenTerminalHide()
      unlistenSessionCreated()
    }
  }, [selectedTopic])

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

  const filteredHosts = hosts.filter(
    (h) =>
      h.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.ip.includes(searchQuery) ||
      h.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900">
      <aside className="w-72 bg-gray-50/80 border-r border-gray-100 flex flex-col">
        <div className="px-7 pt-8 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <TerminalIcon size={19} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-gray-900 leading-none">
                OpenTerm
              </h1>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                自主 AI 助手
              </span>
            </div>
          </div>
        </div>

        <nav className="px-4 space-y-1">
          <NavItem
            active={activeView === 'hosts'}
            onClick={() => setActiveView('hosts')}
            icon={<LayoutGrid size={17} />}
            label="主机画廊"
            count={hosts.length}
          />
          <NavItem
            active={activeView === 'chat'}
            onClick={() => {
              setActiveView('chat')
              if (!selectedTopic && topics.length > 0) setSelectedTopic(topics[0])
            }}
            icon={<MessageSquare size={17} />}
            label="助手对话"
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
                <button
                  key={topic.id}
                  onClick={() => {
                    setSelectedTopic(topic)
                    setPrefilledText('')
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    selectedTopic?.id === topic.id
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-100'
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedTopic?.id === topic.id ? 'bg-blue-500' : 'bg-gray-300'}`}
                  />
                  <span className="truncate">{topic.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 mt-auto">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <ShieldAlert size={15} />
              </div>
              <div>
                <div className="text-xs font-black text-gray-900">HITL 已激活</div>
                <div className="text-[10px] text-gray-400">安全监控中</div>
              </div>
              <div className="ml-auto w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'hosts' && (
          <div className="flex-1 overflow-y-auto bg-gray-50/30">
            <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 px-10 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-gray-900">主机画廊</h2>
                <p className="text-sm text-gray-400 mt-0.5">管理您的远程 SSH 终点</p>
              </div>
              <div className="flex items-center gap-3">
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
            <div className="h-11 bg-gray-900 text-white px-5 flex items-center justify-between border-b border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
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
          />
        )}

        {activeView === 'chat' && !selectedTopic && (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-gray-50/30">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
              <MessageSquare size={36} />
            </div>
            <h2 className="text-2xl font-black text-gray-900">助手对话</h2>
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
    </div>
  )
}
