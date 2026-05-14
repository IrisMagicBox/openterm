import React from 'react'
import type { AgentRun, Host, MemoryEntry, TerminalSession } from '../../../shared/types'
import {
  Activity,
  Brain,
  CircleAlert,
  CircleCheck,
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
  Timer,
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
type HubTone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral'

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
): HubTone {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'waiting_approval' || status === 'retrying') return 'warning'
  if (status === 'running' || status === 'compacting') return 'accent'
  return 'neutral'
}

function isActiveRun(status: AgentRun['status']): boolean {
  return (
    status === 'running' ||
    status === 'waiting_approval' ||
    status === 'compacting' ||
    status === 'retrying'
  )
}

function hostAddress(host: Host): string {
  if (host.id === 'local') return '本机'
  return `${host.username}@${host.ip}:${host.port || 22}`
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
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
  const activeSessions = React.useMemo(
    () => sessions.filter((session) => session.status !== 'closed' && session.visible !== false),
    [sessions]
  )
  const activeRuns = React.useMemo(
    () => runs.filter((run) => isActiveRun(run.status)),
    [runs]
  )
  const enabledMemories = React.useMemo(
    () => memories.filter((memory) => !memory.disabled),
    [memories]
  )
  const activeTunnels = React.useMemo(
    () => tunnels.filter((tunnel) => tunnel.status !== 'closed'),
    [tunnels]
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
    <div className="flex h-full w-full min-w-0 flex-col bg-transparent">
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as WorkspaceView)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-black/[0.05] bg-white/65 px-2 py-2">
          <HubStatusStrip
            hostsCount={hosts.length}
            sessionsCount={activeSessions.length}
            activeRunsCount={activeRuns.length}
            memoriesCount={enabledMemories.length}
            tunnelsCount={activeTunnels.length}
          />
          <TabsList className="mt-2 grid h-7 w-full grid-cols-4 rounded-lg border-0 bg-black/[0.025] p-0.5 shadow-none backdrop-blur-0">
            <WorkspaceTab value="hosts" icon={Server} label="主机" count={hosts.length} />
            <WorkspaceTab value="runs" icon={History} label="Run" count={activeRuns.length} />
            <WorkspaceTab value="memory" icon={Brain} label="记忆" count={enabledMemories.length} />
            <WorkspaceTab
              value="tunnels"
              icon={Globe}
              label="转发"
              count={activeTunnels.length}
            />
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
    </div>
  )
}

function HubStatusStrip({
  hostsCount,
  sessionsCount,
  activeRunsCount,
  memoriesCount,
  tunnelsCount
}: {
  hostsCount: number
  sessionsCount: number
  activeRunsCount: number
  memoriesCount: number
  tunnelsCount: number
}): React.ReactElement {
  const items = [
    { label: '主机', value: hostsCount, tone: hostsCount > 0 ? 'accent' : 'neutral' },
    { label: '终端', value: sessionsCount, tone: sessionsCount > 0 ? 'success' : 'neutral' },
    { label: '运行', value: activeRunsCount, tone: activeRunsCount > 0 ? 'warning' : 'neutral' },
    { label: '记忆', value: memoriesCount, tone: memoriesCount > 0 ? 'accent' : 'neutral' },
    { label: '转发', value: tunnelsCount, tone: tunnelsCount > 0 ? 'success' : 'neutral' }
  ] satisfies Array<{ label: string; value: number; tone: HubTone }>

  return (
    <div className="grid grid-cols-5 gap-1">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-md border border-black/[0.045] bg-white/75 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
        >
          <div
            className={cn(
              'text-sm font-bold leading-none',
              item.tone === 'accent' && 'text-accent',
              item.tone === 'success' && 'text-success',
              item.tone === 'warning' && 'text-warning',
              item.tone === 'neutral' && 'text-muted-foreground'
            )}
          >
            {item.value}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkspaceTab({
  value,
  icon: Icon,
  label,
  count
}: {
  value: WorkspaceView
  icon: React.ElementType
  label: string
  count: number
}): React.ReactElement {
  return (
    <TabsTrigger
      value={value}
      className="h-6 gap-1 px-1 text-[11px] data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none"
    >
      <Icon size={12} />
      <span className="truncate">{label}</span>
      <span className="min-w-3 rounded-full bg-black/[0.045] px-1 text-[9px] font-bold leading-4 text-muted-foreground data-[state=active]:text-accent">
        {count}
      </span>
    </TabsTrigger>
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
      <div className="rounded-lg border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center">
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[11px] font-bold text-muted-foreground">
          主机 {hosts.length} / 终端 {sessions.length}
        </span>
        <Tooltip content="添加主机到当前对话" side="left">
          <IconButton
            aria-label="添加主机到当前对话"
            onClick={onAddHost}
            className="h-6 w-6 text-muted-foreground"
          >
            <Plus size={12} />
          </IconButton>
        </Tooltip>
      </div>
      {hosts.map((host) => {
        const hostSessions = sessions.filter((session) => session.hostId === host.id)

        return (
          <div
            key={host.id}
            className="group/host rounded-lg border border-black/[0.055] bg-white/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
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
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-foreground">
                      {host.alias}
                    </span>
                    <Badge variant={hostSessions.length > 0 ? 'success' : 'neutral'}>
                      {hostSessions.length}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] font-medium text-muted-foreground">
                    {hostAddress(host)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
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

            <div className="mt-2 space-y-1">
              {hostSessions.length === 0 ? (
                <Button
                  onClick={() => onCreateTerminal(host.id)}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start rounded-md border border-dashed border-black/[0.08] bg-black/[0.015] text-xs text-muted-foreground hover:bg-black/[0.03]"
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
                        'group/session relative flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2 transition-colors',
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
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          session.commandStatus === 'running' && 'animate-pulse bg-accent',
                          session.commandStatus === 'failed' && 'bg-danger',
                          session.commandStatus === 'completed' && 'bg-success',
                          (!session.commandStatus || session.commandStatus === 'idle') &&
                            'bg-muted-foreground/35'
                        )}
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
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none">
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
  const activeCount = runs.filter((run) => isActiveRun(run.status)).length

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
        暂无 Run。
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold text-muted-foreground">最近 Run</span>
        <Badge variant={activeCount > 0 ? 'warning' : 'neutral'}>{activeCount} 活跃</Badge>
      </div>
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => onOpenRunDetail?.(run.id)}
          className="w-full rounded-lg border border-black/[0.06] bg-white/85 px-2.5 py-2 text-left transition hover:border-black/[0.08] hover:bg-black/[0.015]"
        >
          <div className="flex items-start gap-2">
            <RunStatusGlyph status={run.status} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-bold text-foreground">
                  {run.goal || run.agentName || 'Agent Run'}
                </span>
                <Badge variant={statusTone(run.status)}>{runStatusLabel(run.status)}</Badge>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <span className="truncate">{run.agentName}</span>
                <span className="shrink-0 text-muted-foreground/45">/</span>
                <span className="shrink-0">{formatRelativeTime(run.updatedAt)}</span>
              </div>
            </div>
            <ExternalLink size={11} className="mt-0.5 shrink-0 text-muted-foreground/70" />
          </div>
        </button>
      ))}
    </div>
  )
}

function RunStatusGlyph({ status }: { status: AgentRun['status'] }): React.ReactElement {
  const tone = statusTone(status)
  const Icon =
    tone === 'success'
      ? CircleCheck
      : tone === 'danger'
        ? CircleAlert
        : tone === 'warning'
          ? Timer
          : Activity

  return (
    <span
      className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'neutral' && 'bg-black/[0.035] text-muted-foreground'
      )}
    >
      <Icon size={12} />
    </span>
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
      <div className="rounded-lg border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
        暂无可见记忆。
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="light-control flex items-center gap-1 rounded-lg p-1">
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
              'h-6 flex-1 rounded-md text-[11px] font-bold transition-colors',
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
        <div className="rounded-lg border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center text-xs font-semibold text-muted-foreground">
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
                'rounded-lg border px-2.5 py-2.5 transition-colors',
                memory.disabled
                  ? 'border-black/[0.05] bg-black/[0.02] opacity-65'
                  : 'border-black/[0.06] bg-white/85'
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
                  className="mt-2 min-h-24 w-full resize-y rounded-lg border border-black/[0.08] bg-black/[0.015] px-2.5 py-2 text-sm leading-6 text-foreground outline-none focus:border-black/[0.14]"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-foreground">
                  {memory.content}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2">
                <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                  <span>重要 {memory.importance}</span>
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
                      className="h-6 w-6 text-success"
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
                      className="h-6 w-6"
                      onClick={() => setEditingId(memory.id)}
                    >
                      <Edit3 size={12} />
                    </IconButton>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => void onUpdate(memory, { disabled: !memory.disabled })}
                  >
                    {memory.disabled ? '启用' : '禁用'}
                  </Button>
                  <ConfirmActionButton
                    aria-label="删除记忆"
                    className="blue-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-danger no-drag hover:bg-white/60"
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
  const tunnelHosts = hosts.filter((host) => host.id !== 'local')
  const firstTunnelHost = tunnelHosts[0]

  return (
    <div className="space-y-2">
      {onOpenPortForward && (
        <div className="rounded-lg border border-black/[0.06] bg-white/85 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-muted-foreground">
              可转发主机 {tunnelHosts.length}
            </span>
            {firstTunnelHost && (
              <IconButton
                aria-label="新建端口转发"
                onClick={() => onOpenPortForward(firstTunnelHost)}
                className="h-6 w-6 text-muted-foreground"
              >
                <Plus size={12} />
              </IconButton>
            )}
          </div>
          {tunnelHosts.length === 0 ? (
            <p className="rounded-md border border-dashed border-black/[0.08] bg-black/[0.015] px-3 py-3 text-center text-xs font-semibold text-muted-foreground">
              添加远程主机后即可创建 tunnel。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {tunnelHosts.map((host) => (
                <Button
                  key={host.id}
                  onClick={() => onOpenPortForward(host)}
                  variant="subtle"
                  size="sm"
                  className="h-7 justify-start border-black/[0.06] bg-white text-[11px]"
                >
                  <Plus size={12} />
                  {host.alias}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {tunnels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/[0.08] bg-black/[0.02] p-4 text-center">
          <div className="text-xs font-semibold text-muted-foreground">暂无活跃 tunnel。</div>
          {onOpenPortForward && firstTunnelHost && (
            <Button
              onClick={() => onOpenPortForward(firstTunnelHost)}
              variant="subtle"
              size="sm"
              className="mt-3 border-black/[0.06] bg-white"
            >
              <Plus size={12} />
              添加转发
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {tunnels.map((tunnel) => {
            const host = hostsById.get(tunnel.hostId)
            return (
              <div
                key={tunnel.id}
                className="rounded-lg border border-black/[0.06] bg-white/85 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-foreground">
                      localhost:{tunnel.localPort}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
                      {host?.alias || tunnel.hostId}
                    </div>
                  </div>
                  <IconButton
                    aria-label="打开 localhost 地址"
                    className="h-6 w-6"
                    onClick={() => window.open(`http://127.0.0.1:${tunnel.localPort}`, '_blank')}
                  >
                    <ExternalLink size={11} />
                  </IconButton>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {'->'} {tunnel.remoteHost}:{tunnel.remotePort}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
