import { X, Monitor, Terminal as TerminalIcon, Pause, Play } from 'lucide-react'
import { TerminalView } from '../TerminalView'
import { TerminalTabBar } from '../terminal/TerminalTabBar'
import type { TerminalSession } from '../../../../shared/types'
import { useConfirm } from '../../hooks/useConfirm'

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
}: TerminalSessionGridProps) {
  const { confirm, ConfirmDialogComponent } = useConfirm()

  return (
    <>
      <div
        className={`w-1.5 hover:w-2 bg-transparent hover:bg-blue-400/20 cursor-col-resize transition-all z-20 active:bg-blue-500/30 ${isResizing ? 'bg-blue-500/30 w-2' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault()
          onSetResizing(true)
        }}
      />
      <div
        style={{ width: terminalWidth }}
        className="border-l border-gray-100 bg-gray-50 flex flex-col shrink-0"
      >
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
                onClick={onOpenCommandPalette}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                title="Command+K"
              >
                Cmd+K
              </button>
            </div>
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
        <div className="flex-1 min-h-0 flex bg-gray-50/50">
          <div
            className={`flex-1 min-h-0 overflow-y-auto p-4 grid gap-4 auto-rows-fr ${visibleSessions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {visibleSessions.slice(0, 4).map((session) => (
              <div
                key={session.id}
                onClick={() => onSetFocusedSessionId(session.id)}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition cursor-pointer flex flex-col ${focusedSession?.id === session.id ? 'border-blue-300 ring-2 ring-blue-100 shadow-blue-100/70' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div
                  className={`px-3 py-2.5 text-gray-800 flex items-center justify-between gap-2 border-b border-gray-100 ${focusedSession?.id === session.id ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <div className="flex items-center gap-2 min-w-0 shrink">
                    <TerminalIcon
                      size={12}
                      className={session.paused ? 'text-amber-500' : 'text-emerald-500'}
                    />
                    <span className="text-xs font-bold truncate">{session.hostAlias}</span>
                    {focusedSession?.id === session.id && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200 mr-1">
                      <button
                        onClick={() => onSetTerminalFontSize(Math.max(terminalFontSize - 1, 6))}
                        className="px-2 py-1 text-[10px] font-black hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
                        title="缩小 (Cmd -)"
                      >
                        -
                      </button>
                      <div className="w-[1px] bg-gray-200" />
                      <button
                        onClick={() => onSetTerminalFontSize(Math.min(terminalFontSize + 1, 30))}
                        className="px-2 py-1 text-[10px] font-black hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
                        title="放大 (Cmd +)"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => onToggleAgentTerminalPaused(session.id, !session.paused)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                        session.paused
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                      title={session.paused ? '恢复 Agent 控制' : '暂停 Agent，人工接管'}
                    >
                      {session.paused ? <Play size={12} /> : <Pause size={12} />}
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
                        onCloseAgentTerminal(session.id)
                      }}
                      className="p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded transition"
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
                <div className="flex-1 min-h-0 bg-white relative">
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
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-black shadow-sm">
                      人工接管中
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${session.paused ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}
                      />
                      <span
                        className={`text-[10px] font-black truncate ${session.paused ? 'text-amber-600' : 'text-emerald-600'}`}
                      >
                        {session.paused ? '人工接管中' : 'Agent 正在控制'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetFocusedSessionId(session.id)
                          onOpenCommandPalette()
                        }}
                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md transition ${
                          focusedSession?.id === session.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        执行命令
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {ConfirmDialogComponent}
    </>
  )
}
