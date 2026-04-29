import React from 'react'
import type { AgentRun, Host, MemoryEntry, TerminalSession } from '../../../shared/types'
import {
  Brain,
  Edit3,
  ExternalLink,
  FileText,
  Folder,
  Globe,
  History,
  Minus,
  Monitor,
  Pin,
  Plus,
  PlusCircle,
  Save,
  Server,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmActionButton,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip
} from './ui'
import { cn } from '../lib/utils'

interface TopicHubProps {
  topicId: string
  hosts: Host[]
  sessions: TerminalSession[]
  onAddHost: () => void
  onRemoveHost: (hostId: string) => void
  onCreateTerminal: (hostId: string) => void
  onCloseTerminal: (sessionId: string) => void | Promise<void>
  onRenameTerminal: (sessionId: string, name: string) => void
  onTogglePin: (sessionId: string, isPinned: boolean) => void
  focusedSessionId: string | null
  onFocusSession: (sessionId: string) => void
  onOpenFileBrowser?: (host: Host) => void
  onOpenPortForward?: (host: Host) => void
  onOpenRunDetail?: (runId: string) => void
}

interface Tunnel {
  id: string
  hostId: string
  localPort: number
  remoteHost: string
  remotePort: number
  status: string
  createdAt: number
}

type WorkspaceView = 'hosts' | 'runs' | 'memory' | 'tunnels'

function runStatusLabel(status: AgentRun['status']): string {
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '取消'
  if (status === 'waiting_approval') return '审批'
  if (status === 'running') return '运行'
  if (status === 'compacting') return '压缩'
  if (status === 'retrying') return '重试'
  return '空闲'
}

function memoryScopeLabel(scope: MemoryEntry['scope']): string {
  if (scope === 'global') return '全局'
  if (scope === 'host') return '主机'
  return 'Topic'
}

function typeLabel(type: MemoryEntry['type']): string {
  if (type === 'user_preference') return '偏好'
  if (type === 'host_fact') return '主机事实'
  if (type === 'topic_summary') return '话题摘要'
  if (type === 'policy_hint') return '策略提示'
  return '任务经验'
}

function statusTone(
  status: AgentRun['status']
): 'accent' | 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'waiting_approval' || status === 'retrying') return 'warning'
  if (status === 'running' || status === 'compacting') return 'accent'
  return 'neutral'
}

export function TopicHub({
  topicId,
  hosts,
  sessions,
  onAddHost,
  onRemoveHost,
  onCreateTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onTogglePin,
  focusedSessionId,
  onFocusSession,
  onOpenFileBrowser,
  onOpenPortForward,
  onOpenRunDetail
}: TopicHubProps): React.ReactElement {
  const [view, setView] = React.useState<WorkspaceView>('hosts')
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [runs, setRuns] = React.useState<AgentRun[]>([])
  const [memories, setMemories] = React.useState<MemoryEntry[]>([])
  const [tunnels, setTunnels] = React.useState<Tunnel[]>([])
  const [memoryDrafts, setMemoryDrafts] = React.useState<Record<string, string>>({})

  const hostIds = React.useMemo(() => new Set(hosts.map((host) => host.id)), [hosts])
  const hostsById = React.useMemo(
    () => new Map(hosts.map((host) => [host.id, host] as const)),
    [hosts]
  )

  const refreshWorkspace = React.useCallback(async (): Promise<void> => {
    const tasks = await window.api.getTasks(topicId)
    const recentTasks = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
    const runLists = await Promise.all(
      recentTasks.map((task) => window.api.getAgentRunsByTask(task.id))
    )
    const memoryLists = await Promise.all([
      window.api.getMemories({ topicId, includeDisabled: true }),
      ...hosts.map((host) => window.api.getMemories({ hostId: host.id, includeDisabled: true }))
    ])
    const allTunnels = await window.api.pfList()
    const uniqueMemories = Array.from(
      new Map(memoryLists.flat().map((memory) => [memory.id, memory] as const)).values()
    )

    setRuns(
      runLists
        .flat()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
    )
    setMemories(uniqueMemories.sort((a, b) => b.importance - a.importance).slice(0, 10))
    setMemoryDrafts((prev) => {
      const next = { ...prev }
      for (const memory of uniqueMemories) {
        if (next[memory.id] === undefined) next[memory.id] = memory.content
      }
      return next
    })
    setTunnels(allTunnels.filter((tunnel) => hostIds.has(tunnel.hostId)))
  }, [hostIds, hosts, topicId])

  React.useEffect(() => {
    void refreshWorkspace()
    const unlistenRunCreated = window.api.onAgentRunCreated((run) => {
      if (run.topicId === topicId) void refreshWorkspace()
    })
    const unlistenRunUpdated = window.api.onAgentRunUpdated((run) => {
      if (run.topicId === topicId) void refreshWorkspace()
    })
    const interval = window.setInterval(() => void refreshWorkspace(), 10000)
    return () => {
      unlistenRunCreated()
      unlistenRunUpdated()
      window.clearInterval(interval)
    }
  }, [refreshWorkspace, topicId])

  const startEditing = (session: TerminalSession): void => {
    setEditingSessionId(session.id)
    setEditName(session.name || '')
  }

  const saveEdit = (sessionId: string): void => {
    if (editName.trim()) onRenameTerminal(sessionId, editName.trim())
    setEditingSessionId(null)
  }

  const updateMemory = async (
    memory: MemoryEntry,
    updates: Parameters<typeof window.api.updateMemory>[1]
  ): Promise<void> => {
    await window.api.updateMemory(memory.id, updates)
    void refreshWorkspace()
  }

  const deleteMemory = async (memory: MemoryEntry): Promise<void> => {
    await window.api.deleteMemory(memory.id)
    void refreshWorkspace()
  }

  return (
    <div className="hidden h-full w-72 shrink-0 flex-col bg-transparent lg:flex">
      <div className="border-b border-black/[0.05] bg-white/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Server size={13} className="text-accent" />
            作战中心
          </h3>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <Metric icon={Server} label="主机" value={hosts.length} />
            <Metric icon={Terminal} label="终端" value={sessions.length} />
            <Metric icon={History} label="Run" value={runs.length} />
            <Metric icon={Globe} label="转发" value={tunnels.length} />
          </div>
          <IconButton aria-label="管理话题主机" onClick={onAddHost} className="h-7 w-7">
            <Plus size={14} />
          </IconButton>
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(next) => setView(next as WorkspaceView)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-black/[0.05] bg-white/55 px-2 py-1.5">
          <TabsList className="grid h-8 w-full grid-cols-4 rounded-lg border-0 bg-black/[0.025] p-0.5 shadow-none backdrop-blur-0">
            <TabsTrigger
              value="hosts"
              className="h-7 gap-1 px-1 text-[11px] data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Server size={12} />
              主机
            </TabsTrigger>
            <TabsTrigger
              value="runs"
              className="h-7 gap-1 px-1 text-[11px] data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <History size={12} />
              Run
            </TabsTrigger>
            <TabsTrigger
              value="memory"
              className="h-7 gap-1 px-1 text-[11px] data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Brain size={12} />
              记忆
            </TabsTrigger>
            <TabsTrigger
              value="tunnels"
              className="h-7 gap-1 px-1 text-[11px] data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Globe size={12} />
              转发
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <TabsContent value="hosts" className="mt-0">
            <HostsPane
              hosts={hosts}
              sessions={sessions}
              focusedSessionId={focusedSessionId}
              editingSessionId={editingSessionId}
              editName={editName}
              onEditName={setEditName}
              onStartEditing={startEditing}
              onSaveEdit={saveEdit}
              onAddHost={onAddHost}
              onRemoveHost={onRemoveHost}
              onCreateTerminal={onCreateTerminal}
              onCloseTerminal={onCloseTerminal}
              onTogglePin={onTogglePin}
              onFocusSession={onFocusSession}
              onOpenFileBrowser={onOpenFileBrowser}
              onOpenPortForward={onOpenPortForward}
            />
          </TabsContent>

          <TabsContent value="runs" className="mt-0">
            <RunsPane runs={runs} onOpenRunDetail={onOpenRunDetail} />
          </TabsContent>

          <TabsContent value="memory" className="mt-0">
            <MemoryPane
              memories={memories}
              drafts={memoryDrafts}
              onDraft={(id, content) => setMemoryDrafts((prev) => ({ ...prev, [id]: content }))}
              onUpdate={updateMemory}
              onDelete={deleteMemory}
            />
          </TabsContent>

          <TabsContent value="tunnels" className="mt-0">
            <TunnelsPane
              hosts={hosts}
              hostsById={hostsById}
              tunnels={tunnels}
              onOpenPortForward={onOpenPortForward}
            />
          </TabsContent>
        </div>
      </Tabs>

      <div className="border-t border-black/[0.05] bg-white/55 px-3 py-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>TOPIC-{topicId.slice(0, 4)}</span>
          <Badge variant="neutral" className="border-black/[0.06] bg-black/[0.02] backdrop-blur-0">
            串行同主机
          </Badge>
        </div>
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
}): React.ReactElement {
  return (
    <Tooltip content={`${label} ${value}`} side="bottom">
      <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon size={11} />
        <strong className="text-sm leading-none text-foreground">{value}</strong>
      </span>
    </Tooltip>
  )
}

function HostsPane({
  hosts,
  sessions,
  focusedSessionId,
  editingSessionId,
  editName,
  onEditName,
  onStartEditing,
  onSaveEdit,
  onAddHost,
  onRemoveHost,
  onCreateTerminal,
  onCloseTerminal,
  onTogglePin,
  onFocusSession,
  onOpenFileBrowser,
  onOpenPortForward
}: {
  hosts: Host[]
  sessions: TerminalSession[]
  focusedSessionId: string | null
  editingSessionId: string | null
  editName: string
  onEditName: (value: string) => void
  onStartEditing: (session: TerminalSession) => void
  onSaveEdit: (sessionId: string) => void
  onAddHost: () => void
  onRemoveHost: (hostId: string) => void
  onCreateTerminal: (hostId: string) => void
  onCloseTerminal: (sessionId: string) => void | Promise<void>
  onTogglePin: (sessionId: string, isPinned: boolean) => void
  onFocusSession: (sessionId: string) => void
  onOpenFileBrowser?: (host: Host) => void
  onOpenPortForward?: (host: Host) => void
}): React.ReactElement {
  if (hosts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center">
        <p className="text-xs font-medium leading-relaxed text-muted-foreground">暂无主机。</p>
        <Button
          onClick={onAddHost}
          variant="subtle"
          size="sm"
          className="mt-3 border-black/[0.06] bg-white"
        >
          <Plus size={12} />
          添加主机
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {hosts.map((host) => {
        const hostSessions = sessions.filter((session) => session.hostId === host.id)

        return (
          <div key={host.id} className="group/host">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                    host.id === 'local'
                      ? 'bg-success-soft text-success'
                      : 'bg-accent-soft text-accent'
                  )}
                >
                  {host.id === 'local' ? (
                    <Monitor size={12} />
                  ) : (
                    host.alias.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="truncate text-xs font-bold text-foreground">{host.alias}</span>
              </div>
              <div className="flex items-center gap-1 opacity-100 transition-opacity">
                <IconButton
                  aria-label={`为 ${host.alias} 开启新终端`}
                  onClick={() => onCreateTerminal(host.id)}
                  className="h-6 w-6 text-success"
                >
                  <PlusCircle size={12} />
                </IconButton>
                {onOpenFileBrowser && host.id !== 'local' && (
                  <Tooltip content="远程文件管理" side="top">
                    <IconButton
                      aria-label={`打开 ${host.alias} 文件管理`}
                      onClick={() => onOpenFileBrowser(host)}
                      className="h-6 w-6"
                    >
                      <Folder size={12} />
                    </IconButton>
                  </Tooltip>
                )}
                {onOpenPortForward && host.id !== 'local' && (
                  <IconButton
                    aria-label={`打开 ${host.alias} 端口转发`}
                    onClick={() => onOpenPortForward(host)}
                    className="h-6 w-6"
                  >
                    <Globe size={12} />
                  </IconButton>
                )}
                <ConfirmActionButton
                  aria-label={`从话题中移除 ${host.alias}`}
                  onConfirm={() => {
                    onRemoveHost(host.id)
                  }}
                  className="blue-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-danger no-drag hover:bg-white/60"
                  confirmClassName="hover:bg-danger-strong"
                  confirmingTitle={`移除 ${host.alias}`}
                >
                  <Trash2 size={12} />
                </ConfirmActionButton>
              </div>
            </div>

            <div className="ml-3 space-y-1 border-l border-black/[0.06] pl-3">
              {hostSessions.length === 0 ? (
                <Button
                  onClick={() => onCreateTerminal(host.id)}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start rounded-xl border border-dashed border-black/[0.08] bg-black/[0.015] text-xs text-muted-foreground hover:bg-black/[0.03]"
                >
                  <Plus size={12} /> 初始化终端
                </Button>
              ) : (
                hostSessions.map((session) => {
                  const focused = focusedSessionId === session.id
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'group/session relative flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                        focused
                          ? 'border-black/[0.08] bg-black/[0.04] text-foreground shadow-sm'
                          : 'border-black/[0.06] bg-white text-muted-foreground hover:border-black/[0.08] hover:bg-black/[0.02]'
                      )}
                      onClick={() => onFocusSession(session.id)}
                    >
                      <Terminal
                        size={11}
                        className={focused ? 'text-accent' : 'text-muted-foreground'}
                      />

                      {editingSessionId === session.id ? (
                        <input
                          autoFocus
                          className="w-full bg-transparent text-xs font-semibold outline-none"
                          value={editName}
                          onChange={(event) => onEditName(event.target.value)}
                          onBlur={() => onSaveEdit(session.id)}
                          onKeyDown={(event) => event.key === 'Enter' && onSaveEdit(session.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">
                          {session.name || '终端'}
                        </span>
                      )}

                      <div
                        className={cn(
                          'flex items-center gap-0.5',
                          focused ? 'opacity-100' : 'opacity-0 group-hover/session:opacity-100'
                        )}
                      >
                        {editingSessionId !== session.id && (
                          <button
                            aria-label="重命名终端"
                            onClick={(event) => {
                              event.stopPropagation()
                              onStartEditing(session)
                            }}
                            className={cn(
                              'rounded p-0.5',
                              focused ? 'hover:bg-white' : 'hover:bg-black/[0.04]'
                            )}
                          >
                            <FileText size={10} />
                          </button>
                        )}
                        <button
                          aria-label={session.isPinned ? '从前台卸载' : '调度至前台'}
                          onClick={(event) => {
                            event.stopPropagation()
                            onTogglePin(session.id, !session.isPinned)
                          }}
                          className={cn(
                            'rounded p-0.5',
                            focused ? 'hover:bg-white' : 'hover:bg-black/[0.04]'
                          )}
                        >
                          <Pin size={10} fill={session.isPinned ? 'currentColor' : 'none'} />
                        </button>
                        <ConfirmActionButton
                          aria-label="关闭终端"
                          onConfirm={() => onCloseTerminal(session.id)}
                          stopPropagation
                          className="rounded p-0.5 text-danger hover:bg-danger-soft"
                          confirmClassName="hover:bg-danger-strong"
                          confirmingTitle="关闭"
                        >
                          <X size={10} />
                        </ConfirmActionButton>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RunsPane({
  runs,
  onOpenRunDetail
}: {
  runs: AgentRun[]
  onOpenRunDetail?: (runId: string) => void
}): React.ReactElement {
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
        暂无 Run。
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => onOpenRunDetail?.(run.id)}
          className="w-full rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 text-left transition hover:border-black/[0.08] hover:bg-black/[0.015]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-bold text-foreground">{run.goal}</span>
            <Badge variant={statusTone(run.status)}>{runStatusLabel(run.status)}</Badge>
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold text-muted-foreground">
            {run.agentName} / {new Date(run.updatedAt).toLocaleTimeString('zh-CN')}
          </div>
        </button>
      ))}
    </div>
  )
}

function MemoryPane({
  memories,
  drafts,
  onDraft,
  onUpdate,
  onDelete
}: {
  memories: MemoryEntry[]
  drafts: Record<string, string>
  onDraft: (id: string, content: string) => void
  onUpdate: (
    memory: MemoryEntry,
    updates: Parameters<typeof window.api.updateMemory>[1]
  ) => Promise<void>
  onDelete: (memory: MemoryEntry) => Promise<void>
}): React.ReactElement {
  const [scopeFilter, setScopeFilter] = React.useState<'all' | MemoryEntry['scope']>('all')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const visibleMemories = React.useMemo(
    () =>
      scopeFilter === 'all' ? memories : memories.filter((memory) => memory.scope === scopeFilter),
    [memories, scopeFilter]
  )

  if (memories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
        暂无可见记忆。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="light-control flex items-center gap-1 rounded-xl p-1">
        {[
          { value: 'all' as const, label: '全部' },
          { value: 'global' as const, label: '全局' },
          { value: 'topic' as const, label: 'Topic' },
          { value: 'host' as const, label: '主机' }
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setScopeFilter(item.value)}
            className={cn(
              'h-7 flex-1 rounded-md text-xs font-bold transition-colors',
              scopeFilter === item.value
                ? 'bg-white text-foreground shadow-none'
                : 'text-muted-foreground hover:bg-white hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleMemories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
          当前范围暂无记忆。
        </div>
      ) : (
        visibleMemories.map((memory) => {
          const editing = editingId === memory.id
          const draft = drafts[memory.id] ?? memory.content
          return (
            <article
              key={memory.id}
              className={cn(
                'rounded-lg border px-3 py-3 transition-colors',
                memory.disabled
                  ? 'border-black/[0.05] bg-black/[0.02] opacity-65'
                  : 'border-black/[0.06] bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge variant="neutral">{memoryScopeLabel(memory.scope)}</Badge>
                  <Badge variant="neutral">{typeLabel(memory.type)}</Badge>
                  {memory.disabled && <Badge variant="warning">已禁用</Badge>}
                </div>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  {Math.round((memory.confidence ?? 0.7) * 100)}%
                </span>
              </div>

              {editing ? (
                <textarea
                  value={draft}
                  onChange={(event) => onDraft(memory.id, event.target.value)}
                  className="mt-3 min-h-32 w-full resize-y rounded-xl border border-black/[0.08] bg-black/[0.015] px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-black/[0.14]"
                />
              ) : (
                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
                  {memory.content}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <span>重要性 {memory.importance}</span>
                  <IconButton
                    aria-label="降低重要性"
                    className="h-6 w-6"
                    onClick={() =>
                      void onUpdate(memory, { importance: Math.max(0, memory.importance - 1) })
                    }
                  >
                    <Minus size={11} />
                  </IconButton>
                  <IconButton
                    aria-label="提升重要性"
                    className="h-6 w-6"
                    onClick={() =>
                      void onUpdate(memory, { importance: Math.min(10, memory.importance + 1) })
                    }
                  >
                    <Plus size={11} />
                  </IconButton>
                </div>

                <div className="flex items-center gap-1">
                  {editing ? (
                    <IconButton
                      aria-label="保存记忆"
                      className="h-7 w-7 text-success"
                      onClick={() => {
                        void onUpdate(memory, { content: draft })
                        setEditingId(null)
                      }}
                    >
                      <Save size={12} />
                    </IconButton>
                  ) : (
                    <IconButton
                      aria-label="编辑记忆"
                      className="h-7 w-7"
                      onClick={() => setEditingId(memory.id)}
                    >
                      <Edit3 size={12} />
                    </IconButton>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => void onUpdate(memory, { disabled: !memory.disabled })}
                  >
                    {memory.disabled ? '启用' : '禁用'}
                  </Button>
                  <ConfirmActionButton
                    aria-label="删除记忆"
                    className="blue-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-danger no-drag hover:bg-white/60"
                    confirmClassName="hover:bg-danger-strong"
                    confirmingTitle="删除记忆"
                    onConfirm={() => void onDelete(memory)}
                  >
                    <Trash2 size={12} />
                  </ConfirmActionButton>
                </div>
              </div>
            </article>
          )
        })
      )}
    </div>
  )
}

function TunnelsPane({
  hosts,
  hostsById,
  tunnels,
  onOpenPortForward
}: {
  hosts: Host[]
  hostsById: Map<string, Host>
  tunnels: Tunnel[]
  onOpenPortForward?: (host: Host) => void
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {onOpenPortForward && (
        <div className="grid grid-cols-1 gap-1.5">
          {hosts
            .filter((host) => host.id !== 'local')
            .map((host) => (
              <Button
                key={host.id}
                onClick={() => onOpenPortForward(host)}
                variant="subtle"
                size="sm"
                className="justify-start border-black/[0.06] bg-white"
              >
                <Globe size={12} />
                {host.alias}
              </Button>
            ))}
        </div>
      )}

      {tunnels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
          暂无活跃 tunnel。
        </div>
      ) : (
        <div className="space-y-1.5">
          {tunnels.map((tunnel) => {
            const host = hostsById.get(tunnel.hostId)
            return (
              <div
                key={tunnel.id}
                className="rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-foreground">
                    {host?.alias || tunnel.hostId}
                  </span>
                  <IconButton
                    aria-label="打开 localhost 地址"
                    className="h-6 w-6"
                    onClick={() => window.open(`http://127.0.0.1:${tunnel.localPort}`, '_blank')}
                  >
                    <ExternalLink size={11} />
                  </IconButton>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  localhost:{tunnel.localPort} {'->'} {tunnel.remoteHost}:{tunnel.remotePort}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
