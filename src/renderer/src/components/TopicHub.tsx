import React from 'react'
import { Host, TerminalSession } from '../../../shared/types'
import {
  Server,
  Terminal,
  Trash2,
  Plus,
  Edit3,
  Pin,
  Shield,
  Monitor,
  X,
  PlusCircle
} from 'lucide-react'
import { useConfirm } from '../hooks/useConfirm'
import { Badge, Button, IconButton } from './ui'
import { cn } from '../lib/utils'

interface TopicHubProps {
  topicId: string
  hosts: Host[]
  sessions: TerminalSession[]
  onAddHost: () => void
  onRemoveHost: (hostId: string) => void
  onCreateTerminal: (hostId: string) => void
  onCloseTerminal: (sessionId: string) => void
  onRenameTerminal: (sessionId: string, name: string) => void
  onTogglePin: (sessionId: string, isPinned: boolean) => void
  focusedSessionId: string | null
  onFocusSession: (sessionId: string) => void
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
  onFocusSession
}: TopicHubProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')

  const startEditing = (session: TerminalSession): void => {
    setEditingSessionId(session.id)
    setEditName(session.name || '')
  }

  const saveEdit = (sessionId: string): void => {
    if (editName.trim()) onRenameTerminal(sessionId, editName.trim())
    setEditingSessionId(null)
  }

  return (
    <div className="glass-sidebar hidden h-full w-64 shrink-0 flex-col border-y-0 border-r-0 lg:flex">
      <div className="flex items-center justify-between border-b border-white/55 bg-white/35 px-4 py-3 backdrop-blur-2xl">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Server size={13} className="text-accent" />
          主机枢纽
        </h3>
        <IconButton aria-label="管理话题主机" onClick={onAddHost} className="h-7 w-7">
          <Plus size={14} />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hosts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/65 text-muted-foreground">
              <Shield size={18} />
            </div>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground">
              暂无主机。点击上方 + 号加入主机。
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-3">
            {hosts.map((host) => {
              const hostSessions = sessions.filter((s) => s.hostId === host.id)

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
                      <span className="truncate text-xs font-bold text-foreground">
                        {host.alias}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-100 transition-opacity">
                      <IconButton
                        aria-label={`为 ${host.alias} 开启新终端`}
                        onClick={() => onCreateTerminal(host.id)}
                        className="h-6 w-6 text-success"
                      >
                        <PlusCircle size={12} />
                      </IconButton>
                      <IconButton
                        aria-label={`从话题中移除 ${host.alias}`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: '移除主机',
                            message: `确定从话题中移除主机"${host.alias}"？`,
                            confirmText: '移除',
                            variant: 'danger'
                          })
                          if (!ok) return
                          onRemoveHost(host.id)
                        }}
                        className="h-6 w-6 text-danger"
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="ml-3 space-y-1 border-l border-white/70 pl-3">
                    {hostSessions.length === 0 ? (
                      <Button
                        onClick={() => onCreateTerminal(host.id)}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start border border-dashed border-border text-xs text-muted-foreground"
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
                                ? 'border-white/65 bg-black/5 text-foreground shadow-sm'
                                : 'border-white/65 bg-white/55 text-muted-foreground hover:border-accent/30 hover:bg-accent-soft/45'
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
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => saveEdit(session.id)}
                                onKeyDown={(e) => e.key === 'Enter' && saveEdit(session.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">
                                {session.name || '终端'}
                              </span>
                            )}

                            <div
                              className={cn(
                                'flex items-center gap-0.5',
                                focused
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover/session:opacity-100'
                              )}
                            >
                              {editingSessionId !== session.id && (
                                <button
                                  aria-label="重命名终端"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditing(session)
                                  }}
                                  className={cn(
                                    'rounded p-0.5',
                                    focused ? 'hover:bg-white/60' : 'hover:bg-border'
                                  )}
                                >
                                  <Edit3 size={10} />
                                </button>
                              )}
                              <button
                                aria-label={session.isPinned ? '从前台卸载' : '调度至前台'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onTogglePin(session.id, !session.isPinned)
                                }}
                                className={cn(
                                  'rounded p-0.5',
                                  focused ? 'hover:bg-white/60' : 'hover:bg-border'
                                )}
                              >
                                <Pin size={10} fill={session.isPinned ? 'currentColor' : 'none'} />
                              </button>
                              <button
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
                                  onCloseTerminal(session.id)
                                }}
                                className="rounded p-0.5 text-danger hover:bg-danger-soft"
                              >
                                <X size={10} />
                              </button>
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
        )}
      </div>

      <div className="border-t border-white/55 bg-white/35 p-3 backdrop-blur-2xl">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>TOPIC-{topicId.slice(0, 4)}</span>
          <Badge variant="neutral">隔离环境</Badge>
        </div>
      </div>
      {ConfirmDialogComponent}
    </div>
  )
}
