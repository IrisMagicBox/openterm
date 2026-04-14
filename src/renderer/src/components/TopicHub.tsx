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
}: TopicHubProps) {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')

  const startEditing = (session: TerminalSession) => {
    setEditingSessionId(session.id)
    setEditName(session.name || '')
  }

  const saveEdit = (sessionId: string) => {
    if (editName.trim()) {
      onRenameTerminal(sessionId, editName.trim())
    }
    setEditingSessionId(null)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100 w-64 shrink-0">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
          <Server size={12} className="text-blue-500" />
          主机枢纽
        </h3>
        <button
          onClick={onAddHost}
          className="p-1 hover:bg-blue-100 text-blue-600 rounded-md transition-colors"
          title="管理话题主机"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {hosts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-300">
              <Shield size={20} />
            </div>
            <p className="text-[11px] text-gray-400 font-bold leading-relaxed px-4">
              暂无主机。点击上方 + 号加入主机。
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {hosts.map((host) => {
              const hostSessions = sessions.filter((s) => s.hostId === host.id)

              return (
                <div key={host.id} className="group/host">
                  <div className="flex items-center justify-between mb-2 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${host.id === 'local' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}
                      >
                        {host.id === 'local' ? (
                          <Monitor size={12} />
                        ) : (
                          host.alias.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <span className="text-xs font-black text-gray-700 truncate">
                        {host.alias}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover/host:opacity-100 transition-opacity">
                      <button
                        onClick={() => onCreateTerminal(host.id)}
                        className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-md"
                        title="开启新终端"
                      >
                        <PlusCircle size={12} />
                      </button>
                      <button
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
                        className="p-1 hover:bg-red-50 text-red-600 rounded-md"
                        title="从话题中移除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 pl-4 border-l-2 border-gray-50 ml-3">
                    {hostSessions.length === 0 ? (
                      <button
                        onClick={() => onCreateTerminal(host.id)}
                        className="w-full py-2 px-3 border border-dashed border-gray-200 rounded-xl text-[10px] font-bold text-gray-400 hover:border-blue-200 hover:text-blue-500 transition-all flex items-center gap-2"
                      >
                        <Plus size={10} /> 初始化终端
                      </button>
                    ) : (
                      hostSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`group/session relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                            focusedSessionId === session.id
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 active:scale-[0.98]'
                              : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/50'
                          }`}
                          onClick={() => onFocusSession(session.id)}
                        >
                          <Terminal
                            size={10}
                            className={
                              focusedSessionId === session.id ? 'text-blue-100' : 'text-gray-400'
                            }
                          />

                          {editingSessionId === session.id ? (
                            <input
                              autoFocus
                              className="bg-transparent border-none text-[10px] font-bold w-full focus:outline-none"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => saveEdit(session.id)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEdit(session.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="text-[10px] font-bold truncate flex-1 leading-none">
                              {session.name || '终端'}
                            </span>
                          )}

                          <div
                            className={`flex items-center gap-1 ${focusedSessionId === session.id ? 'opacity-100' : 'opacity-0 group-hover/session:opacity-100'}`}
                          >
                            {editingSessionId !== session.id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEditing(session)
                                }}
                                className={`p-0.5 rounded ${focusedSessionId === session.id ? 'hover:bg-white/20' : 'hover:bg-gray-200 text-gray-400'}`}
                              >
                                <Edit3 size={10} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onTogglePin(session.id, !session.isPinned)
                              }}
                              className={`p-0.5 rounded ${session.isPinned ? 'text-blue-200' : focusedSessionId === session.id ? 'text-blue-100 hover:bg-white/20' : 'text-gray-300 hover:bg-gray-200'}`}
                              title={session.isPinned ? '从前台卸载' : '调度至前台'}
                            >
                              <Pin size={10} fill={session.isPinned ? 'currentColor' : 'none'} />
                            </button>
                            <button
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
                              className={`p-0.5 rounded ${focusedSessionId === session.id ? 'hover:bg-red-500' : 'hover:bg-red-50 text-red-400'}`}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest">
          <span>隔离环境: TOPIC-{topicId.slice(0, 4)}</span>
          <Monitor size={10} />
        </div>
      </div>
      {ConfirmDialogComponent}
    </div>
  )
}
