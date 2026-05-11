import { useEffect, useMemo, useState } from 'react'
import {
  Command,
  Eye,
  Grid2X2,
  Monitor,
  Pause,
  Play,
  Plus,
  Terminal as TerminalIcon,
  X
} from 'lucide-react'
import { TerminalView } from '../TerminalView'
import type { TerminalSession } from '../../../../shared/types'
import type { TerminalFocusOptions } from '../../hooks/useTerminalStageState'
import { Badge, ConfirmActionButton, IconButton, Tooltip } from '../ui'
import { cn } from '../../lib/utils'
import {
  sortTerminalActivities,
  type TerminalActivity,
  type TerminalStageMode
} from '../../lib/terminal-stage'

interface TerminalStageProps {
  visibleSessions: TerminalSession[]
  focusedSession: TerminalSession | undefined
  focusedSessionId: string | null
  activities: TerminalActivity[]
  mode: TerminalStageMode
  followAgent: boolean
  terminalFontSize: number
  terminalWidth: number
  isResizing: boolean
  topicId: string
  topicHosts: { id: string; alias: string }[]
  commandAssist?: TerminalStageCommandAssist | null
  onCloseAgentTerminal: (id: string) => void | Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseTerminal: (id: string) => Promise<void>
  onOpenCommandPalette: (sessionId?: string) => void
  onCreateTerminal: (hostId: string) => Promise<void>
  onResizeStart: (rightEdge: number) => void
  onSetMode: (mode: TerminalStageMode) => void
  onSetFollowAgent: (followAgent: boolean) => void
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
}

interface TerminalStageCommandAssist {
  sessionId: string | null
  value: string
  historyCommands: string[]
  busy?: boolean
  error?: string | null
  onChange: (value: string) => void
  onSubmit: (context?: { currentInput: string }) => Promise<string | null>
  onClose: () => void | Promise<void>
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

function takeoverBadge(session: TerminalSession): { label: string; variant: 'warning' } | null {
  if (session.paused && session.takeoverMode === 'manual') {
    return { label: '人工接管', variant: 'warning' }
  }
  if (session.lockedBy === 'user' && session.takeoverMode === 'auto') {
    return { label: '用户接管', variant: 'warning' }
  }
  return null
}

function formatDuration(durationMs?: number): string {
  if (durationMs == null) return ''
  if (durationMs < 1000) return `${durationMs}ms`
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function commandPreview(activity?: TerminalActivity): string {
  if (!activity?.command) return '等待下一条命令'
  return activity.command
}

function TerminalControls({
  session,
  onTogglePaused,
  onClose
}: {
  session: TerminalSession
  onTogglePaused: () => void
  onClose: () => void | Promise<void>
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
        session.paused && 'opacity-100'
      )}
    >
      <IconButton
        aria-label={session.paused ? '恢复 Agent 控制' : '暂停 Agent，人工接管'}
        onClick={(event) => {
          event.stopPropagation()
          onTogglePaused()
        }}
        className={cn(
          'h-6 w-6',
          session.paused
            ? 'text-warning hover:bg-warning-soft'
            : 'text-success hover:bg-success-soft'
        )}
      >
        {session.paused ? <Play size={12} /> : <Pause size={12} />}
      </IconButton>
      <ConfirmActionButton
        aria-label="关闭终端"
        onConfirm={() => onClose()}
        stopPropagation
        className="blue-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-danger no-drag hover:bg-danger-soft"
        confirmClassName="hover:bg-danger-strong"
        confirmingTitle="关闭"
      >
        <X size={12} />
      </ConfirmActionButton>
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
    <div className="border-b border-black/[0.06] bg-white px-1.5 py-1">
      <div className="flex gap-1 overflow-x-auto">
        {activities.map((activity) => {
          const session = sessionsById.get(activity.sessionId)
          if (!session) return null
          const focused = focusedSessionId === activity.sessionId
          const highlighted = highlightedSessionId === activity.sessionId
          const duration = formatDuration(activity.durationMs)

          return (
            <button
              key={activity.sessionId}
              title={commandPreview(activity)}
              onClick={() => onFocusSession(activity.sessionId, { userInitiated: true })}
              className={cn(
                'flex h-7 min-w-[150px] max-w-[220px] shrink-0 items-center gap-1.5 border-l-2 px-2 text-left text-xs transition-colors',
                focused
                  ? 'border-accent bg-accent-soft/60 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-black/[0.035] hover:text-foreground',
                highlighted && 'bg-accent-soft/80'
              )}
            >
              <ActivityDot status={activity.status} />
              <div className="min-w-0 flex-1 truncate">
                <span className="font-bold text-foreground">
                  {session.name || activity.hostAlias}
                </span>
                <span className="mx-1 text-muted-foreground/55">/</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {commandPreview(activity)}
                </span>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                {duration || statusLabel(activity.status)}
              </span>
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
  onFocusSession,
  commandAssist
}: {
  session: TerminalSession | undefined
  activity?: TerminalActivity
  highlighted: boolean
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseWithConfirm: (id: string) => void | Promise<void>
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
  commandAssist?: TerminalStageCommandAssist | null
}): React.ReactElement {
  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-muted-foreground">
        选择一个终端即可进入舞台。
      </div>
    )
  }

  const tone = activity ? statusTone(activity.status) : 'neutral'
  const controlBadge = takeoverBadge(session)

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-white',
        highlighted && 'shadow-[inset_2px_0_0_rgba(83,154,248,0.75)]'
      )}
    >
      <div className="group flex h-8 items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <TerminalIcon size={13} className="text-accent" />
            <span className="truncate text-xs font-bold text-foreground">
              {session.name || session.hostAlias}
            </span>
          </div>
          {session.role === 'agent_command' && <Badge variant="accent">Agent</Badge>}
          {session.commandSource === 'user' && <Badge variant="neutral">用户</Badge>}
          {controlBadge && <Badge variant={controlBadge.variant}>{controlBadge.label}</Badge>}
          <span
            className={cn(
              'shrink-0 text-[11px] font-semibold',
              tone === 'neutral' ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {activity ? statusLabel(activity.status) : '空闲'}
          </span>
          <span className="truncate text-[11px] font-semibold text-muted-foreground">
            {activity?.command || session.hostAlias}
          </span>
        </div>
        <TerminalControls
          session={session}
          onTogglePaused={() => onToggleAgentTerminalPaused(session.id, !session.paused)}
          onClose={() => onCloseWithConfirm(session.id)}
        />
      </div>

      <div className="relative min-h-0 flex-1 bg-white">
        <TerminalView
          key={session.id}
          id={session.id}
          topicId={topicId}
          hostId={session.hostId}
          hostAlias={session.hostAlias}
          terminalName={session.name}
          terminalRole={session.role}
          fontSize={terminalFontSize}
          onFocusSession={() => onFocusSession(session.id, { userInitiated: true })}
          onClose={() => onCloseTerminal(session.id)}
          command={session.command}
          commandStatus={session.commandStatus}
          commandSource={session.commandSource}
          paused={session.paused}
          lockedBy={session.lockedBy}
          takeoverMode={session.takeoverMode}
          commandAssist={
            commandAssist?.sessionId === session.id
              ? {
                  open: true,
                  value: commandAssist.value,
                  targetLabel: `${session.hostAlias} / ${session.name || '终端'}`,
                  historyCommands: commandAssist.historyCommands,
                  busy: commandAssist.busy,
                  error: commandAssist.error,
                  onChange: commandAssist.onChange,
                  onSubmit: commandAssist.onSubmit,
                  onClose: commandAssist.onClose
                }
              : null
          }
        />
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
  onFocusSession,
  commandAssist
}: {
  sessions: TerminalSession[]
  activitiesById: Map<string, TerminalActivity>
  focusedSessionId: string | null
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
  onToggleAgentTerminalPaused: (id: string, paused: boolean) => Promise<void>
  onCloseWithConfirm: (id: string) => void | Promise<void>
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
  commandAssist?: TerminalStageCommandAssist | null
}): React.ReactElement {
  return (
    <div className="grid min-h-0 flex-1 auto-rows-[minmax(270px,1fr)] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-px overflow-y-auto bg-workspace-border p-px">
      {sessions.map((session) => {
        const focused = focusedSessionId === session.id
        const activity = activitiesById.get(session.id)
        const tone = activity ? statusTone(activity.status) : 'neutral'
        const controlBadge = takeoverBadge(session)

        return (
          <div
            key={session.id}
            onClick={() => onFocusSession(session.id, { userInitiated: true })}
            className={cn(
              'flex min-h-[270px] cursor-pointer flex-col overflow-hidden border bg-white transition-colors',
              focused
                ? 'border-accent/45 shadow-[inset_2px_0_0_rgba(83,154,248,0.75)]'
                : 'border-transparent hover:border-accent/30'
            )}
          >
            <div className="group flex h-8 items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ActivityDot status={activity?.status || 'idle'} />
                  <span className="truncate text-xs font-bold text-foreground">
                    {session.name || session.hostAlias}
                  </span>
                </div>
                {session.role === 'agent_command' && <Badge variant="accent">Agent</Badge>}
                {session.commandSource === 'user' && <Badge variant="neutral">用户</Badge>}
                {controlBadge && <Badge variant={controlBadge.variant}>{controlBadge.label}</Badge>}
                {focused && <Badge variant="accent">当前</Badge>}
                <span
                  className={cn(
                    'shrink-0 text-[11px] font-semibold',
                    tone === 'neutral' ? 'text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {activity ? statusLabel(activity.status) : '空闲'}
                </span>
                <span className="truncate text-[11px] font-semibold text-muted-foreground">
                  {commandPreview(activity)}
                </span>
              </div>
              <TerminalControls
                session={session}
                onTogglePaused={() => onToggleAgentTerminalPaused(session.id, !session.paused)}
                onClose={() => onCloseWithConfirm(session.id)}
              />
            </div>
            <div className="relative min-h-0 flex-1 bg-white">
              <TerminalView
                id={session.id}
                topicId={topicId}
                hostId={session.hostId}
                hostAlias={session.hostAlias}
                terminalName={session.name}
                terminalRole={session.role}
                fontSize={terminalFontSize}
                onFocusSession={() => onFocusSession(session.id, { userInitiated: true })}
                onClose={() => onCloseTerminal(session.id)}
                command={session.command}
                commandStatus={session.commandStatus}
                commandSource={session.commandSource}
                paused={session.paused}
                lockedBy={session.lockedBy}
                takeoverMode={session.takeoverMode}
                commandAssist={
                  commandAssist?.sessionId === session.id
                    ? {
                        open: true,
                        value: commandAssist.value,
                        targetLabel: `${session.hostAlias} / ${session.name || '终端'}`,
                        historyCommands: commandAssist.historyCommands,
                        busy: commandAssist.busy,
                        error: commandAssist.error,
                        onChange: commandAssist.onChange,
                        onSubmit: commandAssist.onSubmit,
                        onClose: commandAssist.onClose
                      }
                    : null
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TerminalStage({
  visibleSessions,
  focusedSession,
  focusedSessionId,
  activities,
  mode,
  followAgent,
  terminalFontSize,
  terminalWidth,
  isResizing,
  topicId,
  topicHosts,
  commandAssist,
  onCloseAgentTerminal,
  onToggleAgentTerminalPaused,
  onCloseTerminal,
  onOpenCommandPalette,
  onCreateTerminal,
  onResizeStart,
  onSetMode,
  onSetFollowAgent,
  onFocusSession
}: TerminalStageProps): React.ReactElement {
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null)

  const activitiesById = useMemo(
    () => new Map(activities.map((activity) => [activity.sessionId, activity])),
    [activities]
  )
  const sessionsById = useMemo(
    () => new Map(visibleSessions.map((session) => [session.id, session])),
    [visibleSessions]
  )
  const sortedActivities = useMemo(() => sortTerminalActivities(activities), [activities])
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
    const showTimeout = window.setTimeout(() => setHighlightedSessionId(focusedSessionId), 0)
    const hideTimeout = window.setTimeout(() => setHighlightedSessionId(null), 1200)
    return () => {
      window.clearTimeout(showTimeout)
      window.clearTimeout(hideTimeout)
    }
  }, [focusedSessionId])

  const closeWithConfirm = (sessionId: string): void | Promise<void> =>
    onCloseAgentTerminal(sessionId)

  const createTerminal = (): void => {
    const hostId = focusedSession?.hostId || topicHosts[0]?.id
    if (hostId) onCreateTerminal(hostId)
  }

  return (
    <>
      <div
        className={cn(
          'workspace-resize-handle terminal-resize-handle transition-[background-color,opacity,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-interactive)] active:bg-accent/[0.2]',
          isResizing && 'bg-accent/[0.2]'
        )}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整终端边栏宽度"
        data-resizing={isResizing ? 'true' : 'false'}
        onMouseDown={(event) => {
          event.preventDefault()
          const terminalPanel = event.currentTarget.nextElementSibling as HTMLElement | null
          onResizeStart(terminalPanel?.getBoundingClientRect().right ?? window.innerWidth)
        }}
      />
      <div
        style={{ width: terminalWidth, minWidth: 360 }}
        className="workspace-side-panel terminal-stage-layer flex shrink-0 flex-col"
      >
        <div
          className={cn(
            'workspace-layer-header flex h-[var(--workspace-header-height)] items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-3 py-0',
            highlightedSessionId && 'shadow-[inset_0_-1px_0_rgba(83,154,248,0.18)]'
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Monitor size={14} className="shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">终端</h3>
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-accent/15 bg-accent-soft/70 px-1.5 text-[11px] font-bold leading-none text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  {visibleSessions.length}
                </span>
              </div>
              <div className="truncate text-[11px] font-semibold text-muted-foreground">
                {focusedSession
                  ? `${focusedSession.hostAlias} / ${focusedSession.name || '终端'}`
                  : '暂无聚焦'}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div className="flex items-center gap-0.5 rounded-lg bg-black/[0.035] p-0.5">
              {[
                { id: 'stage' as const, label: '舞台', icon: Monitor },
                { id: 'grid' as const, label: '网格', icon: Grid2X2 }
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Tooltip key={item.id} content={item.label} side="bottom">
                    <button
                      aria-label={item.label}
                      onClick={() => onSetMode(item.id)}
                      className={cn(
                        'blue-ring flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground transition',
                        mode === item.id
                          ? 'bg-white text-accent shadow-sm'
                          : 'hover:bg-white/70 hover:text-foreground'
                      )}
                    >
                      <Icon size={12} />
                    </button>
                  </Tooltip>
                )
              })}
            </div>

            <Tooltip content={followAgent ? '取消跟随 Agent' : '跟随 Agent'} side="bottom">
              <button
                aria-label={followAgent ? '取消跟随 Agent' : '跟随 Agent'}
                aria-pressed={followAgent}
                onClick={() => onSetFollowAgent(!followAgent)}
                className={cn(
                  'blue-ring workspace-top-icon-button',
                  followAgent
                    ? 'workspace-top-button-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Eye />
              </button>
            </Tooltip>
            <Tooltip content="命令入口" side="bottom">
              <button
                aria-label="打开命令入口"
                onClick={() => onOpenCommandPalette(focusedSession?.id)}
                className="blue-ring workspace-top-icon-button workspace-top-button-primary"
              >
                <Command />
              </button>
            </Tooltip>
            <Tooltip content="新建终端" side="bottom">
              <IconButton
                aria-label="新建终端"
                onClick={createTerminal}
                className="workspace-top-icon-button text-muted-foreground"
              >
                <Plus />
              </IconButton>
            </Tooltip>
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
              onFocusSession={onFocusSession}
              commandAssist={commandAssist}
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
            onFocusSession={onFocusSession}
            commandAssist={commandAssist}
          />
        )}
      </div>
    </>
  )
}
