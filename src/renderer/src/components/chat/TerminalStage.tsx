import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Command,
  Eye,
  Grid2X2,
  ListTree,
  Loader2,
  Minus,
  Monitor,
  Pause,
  Play,
  Plus,
  Terminal as TerminalIcon,
  X,
  XCircle
} from 'lucide-react'
import { TerminalView } from '../TerminalView'
import type { AgentPart, TerminalSession } from '../../../../shared/types'
import { useConfirm } from '../../hooks/useConfirm'
import type { TerminalFocusOptions } from '../../hooks/useTerminalStageState'
import { Badge, Button, IconButton, Switch } from '../ui'
import { cn } from '../../lib/utils'
import {
  agentPartSessionId,
  parseAgentPartCommand,
  sortTerminalActivities,
  type TerminalActivity,
  type TerminalPreview,
  type TerminalStageMode
} from '../../lib/terminal-stage'

interface TerminalStageProps {
  visibleSessions: TerminalSession[]
  focusedSession: TerminalSession | undefined
  focusedSessionId: string | null
  activeParts: AgentPart[]
  activities: TerminalActivity[]
  previews: Record<string, TerminalPreview>
  mode: TerminalStageMode
  followAgent: boolean
  focusedPartId: string | null
  terminalFontSize: number
  terminalWidth: number
  isResizing: boolean
  topicId: string
  topicHosts: { id: string; alias: string }[]
  onCloseAgentTerminal: (id: string) => void
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseTerminal: (id: string) => Promise<void>
  onOpenCommandPalette: () => void
  onCreateTerminal: (hostId: string) => Promise<void>
  onSetTerminalFontSize: (size: number) => void
  onSetResizing: (resizing: boolean) => void
  onSetMode: (mode: TerminalStageMode) => void
  onSetFollowAgent: (followAgent: boolean) => void
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
  onRevealTerminal: (sessionId: string, partId?: string) => void
}

function statusTone(
  status: TerminalActivity['status']
): 'accent' | 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'running') return 'accent'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'paused') return 'warning'
  return 'neutral'
}

function statusLabel(status: TerminalActivity['status']): string {
  if (status === 'running') return '执行中'
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'paused') return '人工接管'
  return '空闲'
}

function formatDuration(durationMs?: number): string {
  if (durationMs == null) return ''
  if (durationMs < 1000) return `${durationMs}ms`
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function metadataString(part: AgentPart, key: string): string | undefined {
  const value = part.metadata?.[key]
  return typeof value === 'string' ? value : undefined
}

function partOutput(part: AgentPart): string {
  return part.error || metadataString(part, 'liveOutputPreview') || part.output || ''
}

function partStatusLabel(part: AgentPart): string {
  if (part.status === 'pending') return '等待'
  if (part.status === 'running') return '运行中'
  if (part.status === 'completed') return '完成'
  if (part.status === 'error') return '错误'
  if (part.status === 'cancelled') return '取消'
  return '阻塞'
}

function partIcon(part: AgentPart): React.ReactElement {
  if (part.status === 'pending' || part.status === 'running') {
    return <Loader2 size={12} className="animate-spin text-accent" />
  }
  if (part.status === 'completed') return <CheckCircle2 size={12} className="text-success" />
  if (part.status === 'error') return <XCircle size={12} className="text-danger" />
  return <Circle size={12} className="text-muted-foreground" />
}

function sortedParts(parts: AgentPart[]): AgentPart[] {
  return [...parts]
    .filter((part) => part.type !== 'usage')
    .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
}

function commandPreview(activity?: TerminalActivity): string {
  if (!activity?.command) return '等待下一条命令'
  return activity.command
}

function TerminalControls({
  session,
  terminalFontSize,
  onTogglePaused,
  onClose,
  onSetTerminalFontSize,
  onOpenCommandPalette
}: {
  session: TerminalSession
  terminalFontSize: number
  onTogglePaused: () => void
  onClose: () => void
  onSetTerminalFontSize: (size: number) => void
  onOpenCommandPalette: () => void
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex overflow-hidden rounded-md border border-white/70 bg-white/55 backdrop-blur-xl">
        <button
          onClick={(event) => {
            event.stopPropagation()
            onSetTerminalFontSize(Math.max(terminalFontSize - 1, 6))
          }}
          className="px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/75 hover:text-foreground"
          title="缩小 (Cmd -)"
        >
          <Minus size={12} />
        </button>
        <div className="w-px bg-border" />
        <button
          onClick={(event) => {
            event.stopPropagation()
            onSetTerminalFontSize(Math.min(terminalFontSize + 1, 30))
          }}
          className="px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/75 hover:text-foreground"
          title="放大 (Cmd +)"
        >
          <Plus size={12} />
        </button>
      </div>
      <IconButton
        aria-label="打开命令入口"
        onClick={(event) => {
          event.stopPropagation()
          onOpenCommandPalette()
        }}
        className="h-7 w-7"
      >
        <Command size={13} />
      </IconButton>
      <IconButton
        aria-label={session.paused ? '恢复 Agent 控制' : '暂停 Agent，人工接管'}
        onClick={(event) => {
          event.stopPropagation()
          onTogglePaused()
        }}
        className={cn(
          'h-7 w-7',
          session.paused
            ? 'text-warning hover:bg-warning-soft'
            : 'text-success hover:bg-success-soft'
        )}
      >
        {session.paused ? <Play size={13} /> : <Pause size={13} />}
      </IconButton>
      <IconButton
        aria-label="关闭终端"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className="h-7 w-7 text-danger"
      >
        <X size={13} />
      </IconButton>
    </div>
  )
}

function ActivityDot({ status }: { status: TerminalActivity['status'] }): React.ReactElement {
  const tone = statusTone(status)
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        tone === 'accent' && 'animate-pulse bg-accent',
        tone === 'success' && 'bg-success',
        tone === 'danger' && 'bg-danger',
        tone === 'warning' && 'animate-pulse bg-warning',
        tone === 'neutral' && 'bg-muted-foreground/45'
      )}
    />
  )
}

function ActivityRail({
  activities,
  sessionsById,
  focusedSessionId,
  highlightedSessionId,
  onFocusSession
}: {
  activities: TerminalActivity[]
  sessionsById: Map<string, TerminalSession>
  focusedSessionId: string | null
  highlightedSessionId: string | null
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
}): React.ReactElement {
  return (
    <div className="border-b border-white/70 bg-white/45 px-3 py-2 backdrop-blur-2xl">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activities.map((activity) => {
          const session = sessionsById.get(activity.sessionId)
          if (!session) return null
          const focused = focusedSessionId === activity.sessionId
          const highlighted = highlightedSessionId === activity.sessionId
          const duration = formatDuration(activity.durationMs)

          return (
            <button
              key={activity.sessionId}
              onClick={() => onFocusSession(activity.sessionId, { userInitiated: true })}
              className={cn(
                'glass-control flex min-w-[168px] max-w-[240px] shrink-0 flex-col gap-1 rounded-lg px-3 py-2 text-left transition-all',
                focused && 'border-accent/35 bg-accent-soft/65 shadow-sm shadow-accent/10',
                highlighted && 'ring-2 ring-accent/25'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ActivityDot status={activity.status} />
                  <span className="truncate text-xs font-bold text-foreground">
                    {session.name || activity.hostAlias}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                  {duration || statusLabel(activity.status)}
                </span>
              </div>
              <div className="truncate text-[11px] font-semibold text-muted-foreground">
                {activity.hostAlias}
              </div>
              <div className="hidden truncate font-mono text-[11px] text-muted-foreground xl:block">
                {commandPreview(activity)}
              </div>
              {activity.lastLine && (
                <div className="hidden truncate text-[11px] text-muted-foreground/80 2xl:block">
                  {activity.lastLine}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StageTerminalPane({
  session,
  activity,
  highlighted,
  terminalFontSize,
  topicId,
  onCloseTerminal,
  onToggleAgentTerminalPaused,
  onCloseWithConfirm,
  onSetTerminalFontSize,
  onOpenCommandPalette,
  onFocusSession
}: {
  session: TerminalSession | undefined
  activity?: TerminalActivity
  highlighted: boolean
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseWithConfirm: (id: string) => void
  onSetTerminalFontSize: (size: number) => void
  onOpenCommandPalette: () => void
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
}): React.ReactElement {
  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-muted-foreground">
        选择一个终端即可进入舞台。
      </div>
    )
  }

  const tone = activity ? statusTone(activity.status) : 'neutral'

  return (
    <div className="min-h-0 flex-1 p-3">
      <div
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white/75 shadow-[0_18px_55px_rgba(37,99,235,0.08)] backdrop-blur-2xl',
          highlighted ? 'border-accent/45 ring-2 ring-accent/20' : 'border-white/70'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/70 bg-white/65 px-3 py-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <TerminalIcon size={13} className="text-accent" />
              <span className="truncate text-sm font-bold text-foreground">
                {session.name || session.hostAlias}
              </span>
              <Badge variant={tone}>{activity ? statusLabel(activity.status) : '空闲'}</Badge>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="truncate">{session.hostAlias}</span>
              {activity?.command && (
                <>
                  <span className="text-border">/</span>
                  <span className="truncate font-mono">{activity.command}</span>
                </>
              )}
            </div>
          </div>
          <TerminalControls
            session={session}
            terminalFontSize={terminalFontSize}
            onTogglePaused={() => onToggleAgentTerminalPaused(session.id, !session.paused)}
            onClose={() => onCloseWithConfirm(session.id)}
            onSetTerminalFontSize={onSetTerminalFontSize}
            onOpenCommandPalette={onOpenCommandPalette}
          />
        </div>

        <div className="relative min-h-0 flex-1 bg-white">
          <TerminalView
            key={session.id}
            id={session.id}
            topicId={topicId}
            hostId={session.hostId}
            fontSize={terminalFontSize}
            onFocusSession={() => onFocusSession(session.id, { userInitiated: true })}
            onClose={() => onCloseTerminal(session.id)}
            command={session.command}
            commandStatus={session.commandStatus}
          />
          {session.paused && (
            <div className="absolute right-3 top-3 rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white shadow-sm">
              人工接管中
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GridMode({
  sessions,
  activitiesById,
  focusedSessionId,
  terminalFontSize,
  topicId,
  onCloseTerminal,
  onToggleAgentTerminalPaused,
  onCloseWithConfirm,
  onSetTerminalFontSize,
  onOpenCommandPalette,
  onFocusSession
}: {
  sessions: TerminalSession[]
  activitiesById: Map<string, TerminalActivity>
  focusedSessionId: string | null
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseWithConfirm: (id: string) => void
  onSetTerminalFontSize: (size: number) => void
  onOpenCommandPalette: () => void
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
}): React.ReactElement {
  return (
    <div className="grid min-h-0 flex-1 auto-rows-[minmax(270px,1fr)] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3 overflow-y-auto p-3">
      {sessions.map((session) => {
        const focused = focusedSessionId === session.id
        const activity = activitiesById.get(session.id)
        const tone = activity ? statusTone(activity.status) : 'neutral'

        return (
          <div
            key={session.id}
            onClick={() => onFocusSession(session.id, { userInitiated: true })}
            className={cn(
              'flex min-h-[270px] cursor-pointer flex-col overflow-hidden rounded-lg border bg-white/75 backdrop-blur-xl transition-all',
              focused
                ? 'border-accent/45 ring-2 ring-accent/15'
                : 'border-white/70 hover:border-accent/30'
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/70 bg-white/65 px-3 py-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ActivityDot status={activity?.status || 'idle'} />
                  <span className="truncate text-xs font-bold text-foreground">
                    {session.name || session.hostAlias}
                  </span>
                  {focused && <Badge variant="accent">当前</Badge>}
                  {activity && <Badge variant={tone}>{statusLabel(activity.status)}</Badge>}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {commandPreview(activity)}
                </div>
              </div>
              <TerminalControls
                session={session}
                terminalFontSize={terminalFontSize}
                onTogglePaused={() => onToggleAgentTerminalPaused(session.id, !session.paused)}
                onClose={() => onCloseWithConfirm(session.id)}
                onSetTerminalFontSize={onSetTerminalFontSize}
                onOpenCommandPalette={() => {
                  onFocusSession(session.id, { userInitiated: true })
                  onOpenCommandPalette()
                }}
              />
            </div>
            <div className="relative min-h-0 flex-1 bg-white">
              <TerminalView
                id={session.id}
                topicId={topicId}
                hostId={session.hostId}
                fontSize={terminalFontSize}
                onFocusSession={() => onFocusSession(session.id, { userInitiated: true })}
                onClose={() => onCloseTerminal(session.id)}
                command={session.command}
                commandStatus={session.commandStatus}
              />
              {session.paused && (
                <div className="absolute right-3 top-3 rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white shadow-sm">
                  人工接管中
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TimelineMode({
  parts,
  focusedPartId,
  focusedSession,
  focusedActivity,
  terminalFontSize,
  topicId,
  highlighted,
  onRevealTerminal,
  onFocusSession,
  onCloseTerminal,
  onToggleAgentTerminalPaused,
  onCloseWithConfirm,
  onSetTerminalFontSize,
  onOpenCommandPalette
}: {
  parts: AgentPart[]
  focusedPartId: string | null
  focusedSession: TerminalSession | undefined
  focusedActivity?: TerminalActivity
  terminalFontSize: number
  topicId: string
  highlighted: boolean
  onRevealTerminal: (sessionId: string, partId?: string) => void
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
  onCloseTerminal: (id: string) => Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseWithConfirm: (id: string) => void
  onSetTerminalFontSize: (size: number) => void
  onOpenCommandPalette: () => void
}): React.ReactElement {
  const timelineParts = sortedParts(parts)
  const selectedPart =
    timelineParts.find((part) => part.id === focusedPartId) ||
    [...timelineParts].reverse().find((part) => part.type !== 'text') ||
    timelineParts[timelineParts.length - 1]
  const selectedOutput = selectedPart ? partOutput(selectedPart) : ''
  const selectedInput = selectedPart ? parseAgentPartCommand(selectedPart) : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="grid max-h-56 shrink-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="glass-control overflow-y-auto rounded-lg p-2">
          {timelineParts.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs font-semibold text-muted-foreground">
              暂无执行时间线。
            </div>
          ) : (
            <div className="space-y-1.5">
              {timelineParts.map((part) => {
                const sessionId = agentPartSessionId(part)
                const selected = selectedPart?.id === part.id
                return (
                  <button
                    key={part.id}
                    disabled={!sessionId}
                    onClick={() => sessionId && onRevealTerminal(sessionId, part.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md border px-2 py-2 text-left transition',
                      selected
                        ? 'border-accent/35 bg-accent-soft/65'
                        : 'border-white/60 bg-white/55 hover:border-accent/25 hover:bg-white/75',
                      !sessionId && 'cursor-default opacity-75'
                    )}
                  >
                    <div className="mt-0.5">{partIcon(part)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-foreground">
                          {part.toolName || part.type}
                        </span>
                        <Badge
                          variant={
                            part.status === 'error'
                              ? 'danger'
                              : part.status === 'running'
                                ? 'accent'
                                : 'neutral'
                          }
                        >
                          {partStatusLabel(part)}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {parseAgentPartCommand(part) || part.output || part.error || '等待输出'}
                      </div>
                    </div>
                    {sessionId && <Eye size={12} className="mt-0.5 shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="glass-control min-h-0 overflow-hidden rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-xs font-bold text-foreground">
              {selectedPart ? selectedPart.toolName || selectedPart.type : '工具详情'}
            </div>
            {selectedPart && <Badge variant="neutral">{partStatusLabel(selectedPart)}</Badge>}
          </div>
          {selectedInput && (
            <div className="mb-2 truncate rounded-md bg-white/65 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {selectedInput}
            </div>
          )}
          {selectedOutput ? (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-workspace px-3 py-2 font-mono text-[11px] leading-relaxed text-workspace-foreground">
              {selectedOutput}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-white/50 px-3 py-4 text-center text-xs font-semibold text-muted-foreground">
              暂无输出预览。
            </div>
          )}
        </div>
      </div>

      <StageTerminalPane
        session={focusedSession}
        activity={focusedActivity}
        highlighted={highlighted}
        terminalFontSize={terminalFontSize}
        topicId={topicId}
        onCloseTerminal={onCloseTerminal}
        onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
        onCloseWithConfirm={onCloseWithConfirm}
        onSetTerminalFontSize={onSetTerminalFontSize}
        onOpenCommandPalette={onOpenCommandPalette}
        onFocusSession={onFocusSession}
      />
    </div>
  )
}

export function TerminalStage({
  visibleSessions,
  focusedSession,
  focusedSessionId,
  activeParts,
  activities,
  mode,
  followAgent,
  focusedPartId,
  terminalFontSize,
  terminalWidth,
  isResizing,
  topicId,
  topicHosts,
  onCloseAgentTerminal,
  onToggleAgentTerminalPaused,
  onCloseTerminal,
  onOpenCommandPalette,
  onCreateTerminal,
  onSetTerminalFontSize,
  onSetResizing,
  onSetMode,
  onSetFollowAgent,
  onFocusSession,
  onRevealTerminal
}: TerminalStageProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null)

  const activitiesById = useMemo(
    () => new Map(activities.map((activity) => [activity.sessionId, activity])),
    [activities]
  )
  const sessionsById = useMemo(
    () => new Map(visibleSessions.map((session) => [session.id, session])),
    [visibleSessions]
  )
  const sortedActivities = useMemo(
    () => sortTerminalActivities(activities, focusedSessionId),
    [activities, focusedSessionId]
  )
  const sortedSessions = useMemo(
    () =>
      sortedActivities
        .map((activity) => sessionsById.get(activity.sessionId))
        .filter((session): session is TerminalSession => !!session),
    [sessionsById, sortedActivities]
  )
  const focusedActivity = focusedSessionId ? activitiesById.get(focusedSessionId) : undefined

  useEffect(() => {
    if (!focusedSessionId) return
    setHighlightedSessionId(focusedSessionId)
    const timeout = window.setTimeout(() => setHighlightedSessionId(null), 1200)
    return () => window.clearTimeout(timeout)
  }, [focusedSessionId, focusedPartId])

  const closeWithConfirm = async (sessionId: string): Promise<void> => {
    const ok = await confirm({
      title: '关闭终端',
      message: '确定关闭此终端？',
      confirmText: '关闭',
      variant: 'danger'
    })
    if (!ok) return
    onCloseAgentTerminal(sessionId)
  }

  const createTerminal = (): void => {
    const hostId = focusedSession?.hostId || topicHosts[0]?.id
    if (hostId) onCreateTerminal(hostId)
  }

  return (
    <>
      <div
        className={cn(
          'z-20 w-1.5 cursor-col-resize bg-transparent transition-all hover:w-2 hover:bg-accent/15 active:bg-accent/25',
          isResizing && 'w-2 bg-accent/25'
        )}
        onMouseDown={(event) => {
          event.preventDefault()
          onSetResizing(true)
        }}
      />
      <div
        style={{ width: terminalWidth, minWidth: 360 }}
        className="flex shrink-0 flex-col border-l border-white/70 bg-white/45 backdrop-blur-2xl"
      >
        <div
          className={cn(
            'space-y-3 border-b border-white/70 bg-white/60 px-4 py-3 backdrop-blur-2xl',
            highlightedSessionId && 'shadow-[inset_0_-1px_0_rgba(37,99,235,0.2)]'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Monitor size={13} className="text-accent" />
                终端舞台
              </h3>
              <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                {focusedSession
                  ? `${focusedSession.hostAlias} / ${focusedSession.name || '终端'}`
                  : '暂无聚焦终端'}
              </div>
            </div>
            <Badge variant="accent">{visibleSessions.length} 个终端</Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="glass-control flex items-center rounded-lg p-1">
              {[
                { id: 'stage' as const, label: '舞台', icon: Monitor },
                { id: 'grid' as const, label: '网格', icon: Grid2X2 },
                { id: 'timeline' as const, label: '时间线', icon: ListTree }
              ].map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => onSetMode(item.id)}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition',
                      mode === item.id
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-white/70 hover:text-foreground'
                    )}
                  >
                    <Icon size={12} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <label className="glass-control flex h-8 items-center gap-2 rounded-md px-2 text-xs font-semibold text-muted-foreground">
                <Switch checked={followAgent} onCheckedChange={onSetFollowAgent} />
                跟随 Agent
              </label>
              <Button onClick={onOpenCommandPalette} variant="primary" size="sm" title="Command+K">
                <Command size={13} />
                Cmd+K
              </Button>
              <IconButton aria-label="新建终端" onClick={createTerminal} className="h-8 w-8">
                <Plus size={14} />
              </IconButton>
            </div>
          </div>
        </div>

        {mode === 'stage' && (
          <>
            <ActivityRail
              activities={sortedActivities}
              sessionsById={sessionsById}
              focusedSessionId={focusedSessionId}
              highlightedSessionId={highlightedSessionId}
              onFocusSession={onFocusSession}
            />
            <StageTerminalPane
              session={focusedSession}
              activity={focusedActivity}
              highlighted={highlightedSessionId === focusedSessionId}
              terminalFontSize={terminalFontSize}
              topicId={topicId}
              onCloseTerminal={onCloseTerminal}
              onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
              onCloseWithConfirm={closeWithConfirm}
              onSetTerminalFontSize={onSetTerminalFontSize}
              onOpenCommandPalette={onOpenCommandPalette}
              onFocusSession={onFocusSession}
            />
          </>
        )}

        {mode === 'grid' && (
          <GridMode
            sessions={sortedSessions}
            activitiesById={activitiesById}
            focusedSessionId={focusedSessionId}
            terminalFontSize={terminalFontSize}
            topicId={topicId}
            onCloseTerminal={onCloseTerminal}
            onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
            onCloseWithConfirm={closeWithConfirm}
            onSetTerminalFontSize={onSetTerminalFontSize}
            onOpenCommandPalette={onOpenCommandPalette}
            onFocusSession={onFocusSession}
          />
        )}

        {mode === 'timeline' && (
          <TimelineMode
            parts={activeParts}
            focusedPartId={focusedPartId}
            focusedSession={focusedSession}
            focusedActivity={focusedActivity}
            terminalFontSize={terminalFontSize}
            topicId={topicId}
            highlighted={highlightedSessionId === focusedSessionId}
            onRevealTerminal={onRevealTerminal}
            onFocusSession={onFocusSession}
            onCloseTerminal={onCloseTerminal}
            onToggleAgentTerminalPaused={onToggleAgentTerminalPaused}
            onCloseWithConfirm={closeWithConfirm}
            onSetTerminalFontSize={onSetTerminalFontSize}
            onOpenCommandPalette={onOpenCommandPalette}
          />
        )}
      </div>
      {ConfirmDialogComponent}
    </>
  )
}
