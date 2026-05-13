import { useEffect, useMemo, useState } from 'react'
import {
  Command,
  Eye,
  Grid2X2,
  Monitor,
  Plus
} from 'lucide-react'
import { TerminalView } from '../TerminalView'
import type { TerminalSession } from '../../../../shared/types'
import type { TerminalFocusOptions } from '../../hooks/useTerminalStageState'
import { IconButton, Tooltip } from '../ui'
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

function isAgentOperating(session: TerminalSession): boolean {
  if (session.paused || session.lockedBy === 'user') return false
  return session.commandStatus === 'running' && session.commandSource === 'agent'
}

function StageTerminalPane({
  session,
  highlighted,
  terminalFontSize,
  topicId,
  onCloseTerminal,
  onFocusSession,
  commandAssist
}: {
  session: TerminalSession | undefined
  highlighted: boolean
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
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

  const agentOperating = isAgentOperating(session)

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white',
        highlighted && !agentOperating && 'shadow-[inset_2px_0_0_rgba(83,154,248,0.42)]'
      )}
    >
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
  focusedSessionId,
  terminalFontSize,
  topicId,
  onCloseTerminal,
  onFocusSession,
  commandAssist
}: {
  sessions: TerminalSession[]
  focusedSessionId: string | null
  terminalFontSize: number
  topicId: string
  onCloseTerminal: (id: string) => Promise<void>
  onFocusSession: (sessionId: string, options?: TerminalFocusOptions) => void
  commandAssist?: TerminalStageCommandAssist | null
}): React.ReactElement {
  return (
    <div className="grid min-h-0 flex-1 auto-rows-[minmax(270px,1fr)] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-px overflow-y-auto bg-workspace-border p-px">
      {sessions.map((session) => {
        const focused = focusedSessionId === session.id
        const agentOperating = isAgentOperating(session)

        return (
          <div
            key={session.id}
            onClick={() => onFocusSession(session.id, { userInitiated: true })}
            className={cn(
              'relative flex min-h-[270px] cursor-pointer flex-col overflow-hidden border bg-white transition-colors',
              focused ? 'border-accent/45' : 'border-transparent hover:border-accent/30',
              focused && !agentOperating && 'shadow-[inset_2px_0_0_rgba(83,154,248,0.42)]'
            )}
          >
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
  onCloseTerminal,
  onOpenCommandPalette,
  onCreateTerminal,
  onResizeStart,
  onSetMode,
  onSetFollowAgent,
  onFocusSession
}: TerminalStageProps): React.ReactElement {
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null)

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

  useEffect(() => {
    if (!focusedSessionId) return
    const showTimeout = window.setTimeout(() => setHighlightedSessionId(focusedSessionId), 0)
    const hideTimeout = window.setTimeout(() => setHighlightedSessionId(null), 1200)
    return () => {
      window.clearTimeout(showTimeout)
      window.clearTimeout(hideTimeout)
    }
  }, [focusedSessionId])

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
            'workspace-layer-header terminal-stage-header flex h-[var(--workspace-header-height)] items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-3 py-0',
            highlightedSessionId && 'shadow-[inset_0_-1px_0_rgba(83,154,248,0.18)]'
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <Monitor size={14} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">终端</h3>
                <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-accent-soft/70 px-1 text-[10px] font-bold leading-none text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
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
          <StageTerminalPane
            session={focusedSession}
            highlighted={highlightedSessionId === focusedSessionId}
            terminalFontSize={terminalFontSize}
            topicId={topicId}
            onCloseTerminal={onCloseTerminal}
            onFocusSession={onFocusSession}
            commandAssist={commandAssist}
          />
        )}

        {mode === 'grid' && (
          <GridMode
            sessions={sortedSessions}
            focusedSessionId={focusedSessionId}
            terminalFontSize={terminalFontSize}
            topicId={topicId}
            onCloseTerminal={onCloseTerminal}
            onFocusSession={onFocusSession}
            commandAssist={commandAssist}
          />
        )}
      </div>
    </>
  )
}
