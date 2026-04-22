import { Zap, X } from 'lucide-react'

interface DebugLog {
  level: string
  timestamp: number
  category: string
  message: string
  data?: unknown
}

interface DebugPanelProps {
  showDebug: boolean
  setShowDebug: (v: boolean) => void
  debugLogs: DebugLog[]
  clearDebugLogs: () => void
}

export function DebugPanel({
  showDebug,
  setShowDebug,
  debugLogs,
  clearDebugLogs
}: DebugPanelProps): React.ReactElement | null {
  if (!showDebug) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex max-h-[500px] w-[400px] flex-col overflow-hidden rounded-lg border border-workspace-border bg-workspace shadow-xl animate-in">
      <div className="flex items-center justify-between border-b border-workspace-border bg-workspace-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <h3 className="text-xs font-semibold text-workspace-foreground">系统调试信息</h3>
        </div>
        <button
          onClick={() => setShowDebug(false)}
          className="rounded-md p-1.5 text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-workspace-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs">
        {debugLogs.length === 0 && (
          <div className="text-gray-600 italic text-center py-10">等待日志输入...</div>
        )}
        {debugLogs.map((log, i) => (
          <div key={i} className="flex flex-col gap-1 border-l-2 border-gray-800 pl-3 py-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  log.level === 'ERROR'
                    ? 'bg-red-500/20 text-red-400'
                    : log.level === 'WARN'
                      ? 'bg-amber-500/20 text-amber-400'
                      : log.level === 'DEBUG'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {log.level}
              </span>
              <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="text-blue-500/70">[{log.category}]</span>
            </div>
            <div className="text-gray-300 leading-relaxed break-words">{log.message}</div>
            {log.data !== undefined && log.data !== null && (
              <pre className="text-gray-500 bg-black/30 p-2 rounded-lg mt-1 overflow-x-auto">
                {String(JSON.stringify(log.data, null, 2))}
              </pre>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 py-2 bg-black/40 border-t border-gray-800 flex justify-between">
        <span className="text-xs text-gray-500">显示最近 100 条日志</span>
        <button
          onClick={() => clearDebugLogs()}
          className="text-xs text-accent hover:text-blue-400 font-semibold"
        >
          清空日志
        </button>
      </div>
    </div>
  )
}
