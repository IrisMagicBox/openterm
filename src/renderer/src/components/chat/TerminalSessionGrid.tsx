import { X, Monitor, Terminal as TerminalIcon, Pause, Play } from 'lucide-react'
import { TerminalView } from '../TerminalView'
import { TerminalTabBar } from '../terminal/TerminalTabBar'
import type { TerminalSession } from '../../../../shared/types'
import { useConfirm } from '../../hooks/useConfirm'
import { Badge, Button, IconButton } from '../ui'
import { cn } from '../../lib/utils'

interface TerminalSessionGridProps {
  visibleSessions: TerminalSession[]
  focusedSession: TerminalSession | undefined
  focusedSessionId: string | null
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
  onSetFocusedSessionId: (id: string) => void
  onFocusSession: (sessionId: string) => void
}

function statusTone(
  status: TerminalSession['commandStatus']
): 'accent' | 'success' | 'danger' | 'neutral' {
  if (status === 'running') return 'accent'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function TerminalSessionGrid({
  visibleSessions,
  focusedSession,
  focusedSessionId,
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
  onSetFocusedSessionId,
  onFocusSession
}: TerminalSessionGridProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()

  return (
    <>
      <div
        className={cn(
          'z-20 w-1.5 cursor-col-resize bg-transparent transition-all hover:w-2 hover:bg-accent/15 active:bg-accent/25',
          isResizing && 'w-2 bg-accent/25'
        )}
        onMouseDown={(e) => {
          e.preventDefault()
          onSetResizing(true)
        }}
      />
      <div
        style={{ width: terminalWidth }}
        className="flex shrink-0 flex-col border-l border-border bg-app"
      >
        <div className="space-y-3 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Monitor size={13} />
              共驾终端
            </h3>
            <Badge variant="accent">{visibleSessions.length} 个活动终端</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-foreground">
                {focusedSession ? focusedSession.hostAlias : '未选择终端'}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {focusedSession
                  ? focusedSession.paused
                    ? '当前由人工接管，Agent 已暂停'
                    : '当前由 Agent 驱动，可随时接管'
                  : '点击任一终端后即可接管或自然语言下达指令'}
              </div>
            </div>
            <Button onClick={onOpenCommandPalette} variant="primary" size="sm" title="Command+K">
              Cmd+K
            </Button>
          </div>
        </div>

        {visibleSessions.length > 0 && (
          <TerminalTabBar
            tabs={visibleSessions.map((s) => ({
              id: s.id,
              hostAlias: s.hostAlias,
              name: s.name,
              active: s.id === focusedSessionId
            }))}
            onTabSelect={(id) => onSetFocusedSessionId(id)}
            onTabClose={async (id) => {
              const ok = await confirm({
                title: '关闭终端',
                message: '确定关闭此终端？',
                confirmText: '关闭',
                variant: 'danger'
              })
              if (!ok) return
              onCloseAgentTerminal(id)
            }}
            onNewTab={() => {
              const hostId = focusedSession?.hostId || topicHosts[0]?.id
              if (hostId) onCreateTerminal(hostId)
            }}
          />
        )}

        <div className="flex min-h-0 flex-1 bg-app">
          <div
            className={cn(
              'grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto p-3',
              visibleSessions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
            )}
          >
            {visibleSessions.slice(0, 4).map((session) => {
              const isFocused = focusedSession?.id === session.id
              const tone = statusTone(session.commandStatus)
              return (
                <div
                  key={session.id}
                  onClick={() => onSetFocusedSessionId(session.id)}
                  className={cn(
                    'flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface transition-colors',
                    isFocused
                      ? 'border-accent ring-2 ring-accent/15'
                      : 'border-border hover:border-accent/40'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-foreground',
                      isFocused ? 'bg-accent-soft/60' : 'bg-surface'
                    )}
                  >
                    <div className="flex min-w-0 shrink items-center gap-2">
                      <TerminalIcon
                        size={12}
                        className={session.paused ? 'text-warning' : 'text-success'}
                      />
                      <span className="truncate text-xs font-semibold">{session.hostAlias}</span>
                      {isFocused && <Badge variant="accent">当前</Badge>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="mr-1 flex overflow-hidden rounded-md border border-border bg-surface-muted">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSetTerminalFontSize(Math.max(terminalFontSize - 1, 6))
                          }}
                          className="px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-border/60 hover:text-foreground"
                          title="缩小 (Cmd -)"
                        >
                          -
                        </button>
                        <div className="w-px bg-border" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSetTerminalFontSize(Math.min(terminalFontSize + 1, 30))
                          }}
                          className="px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-border/60 hover:text-foreground"
                          title="放大 (Cmd +)"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleAgentTerminalPaused(session.id, !session.paused)
                        }}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-semibold transition',
                          session.paused
                            ? 'bg-warning-soft text-warning hover:bg-warning/15'
                            : 'bg-success-soft text-success hover:bg-success/15'
                        )}
                        title={session.paused ? '恢复 Agent 控制' : '暂停 Agent，人工接管'}
                      >
                        {session.paused ? <Play size={12} /> : <Pause size={12} />}
                      </button>
                      <IconButton
                        aria-label="关闭终端"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const ok = await confirm({
                            title: '关闭终端',
                            message: '确定关闭此终端？',
                            confirmText: '关闭',
                            variant: 'danger'
                          })
                          if (!ok) return
                          onCloseAgentTerminal(session.id)
                        }}
                        className="h-6 w-6"
                      >
                        <X size={12} />
                      </IconButton>
                    </div>
                  </div>

                  {session.commandStatus && session.commandStatus !== 'idle' && (
                    <div
                      className={cn(
                        'border-b px-3 py-2',
                        tone === 'accent' && 'border-accent/20 bg-accent-soft',
                        tone === 'success' && 'border-success/20 bg-success-soft',
                        tone === 'danger' && 'border-danger/20 bg-danger-soft'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              tone === 'accent' && 'animate-pulse bg-accent',
                              tone === 'success' && 'bg-success',
                              tone === 'danger' && 'bg-danger'
                            )}
                          />
                          <span
                            className={cn(
                              'truncate text-xs font-semibold',
                              tone === 'accent' && 'text-accent',
                              tone === 'success' && 'text-success',
                              tone === 'danger' && 'text-danger'
                            )}
                          >
                            {session.command}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 text-xs',
                            tone === 'accent' && 'text-accent',
                            tone === 'success' && 'text-success',
                            tone === 'danger' && 'text-danger'
                          )}
                        >
                          {session.commandStatus === 'running'
                            ? '执行中...'
                            : `exit ${session.commandExitCode} · ${session.commandDurationMs}ms`}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="relative min-h-0 flex-1 bg-surface">
                    <TerminalView
                      id={session.id}
                      topicId={topicId}
                      hostId={session.hostId}
                      fontSize={terminalFontSize}
                      onFocusSession={() => onFocusSession(session.id)}
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

                  <div className="border-t border-border bg-surface-muted px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            session.paused ? 'animate-pulse bg-warning' : 'bg-success'
                          )}
                        />
                        <span
                          className={cn(
                            'truncate text-xs font-semibold',
                            session.paused ? 'text-warning' : 'text-success'
                          )}
                        >
                          {session.paused ? '人工接管中' : 'Agent 正在控制'}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetFocusedSessionId(session.id)
                          onOpenCommandPalette()
                        }}
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-semibold transition',
                          isFocused
                            ? 'bg-accent text-white'
                            : 'bg-border text-muted-foreground hover:bg-muted-foreground/20'
                        )}
                      >
                        执行命令
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {ConfirmDialogComponent}
    </>
  )
}
