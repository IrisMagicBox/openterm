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
    <div className="glass-menu fixed bottom-4 right-4 z-[9999] flex max-h-[500px] w-[400px] flex-col overflow-hidden rounded-2xl animate-in">
      <div className="flex items-center justify-between border-b border-white/60 bg-white/35 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <h3 className="text-xs font-semibold text-foreground">系统调试信息</h3>
        </div>
        <button
          onClick={() => setShowDebug(false)}
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/60 hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs">
        {debugLogs.length === 0 && (
          <div className="py-10 text-center text-muted-foreground italic">等待日志输入...</div>
        )}
        {debugLogs.map((log, i) => (
          <div key={i} className="flex flex-col gap-1 border-l-2 border-border py-1 pl-3">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  log.level === 'ERROR'
                    ? 'bg-danger-soft text-danger'
                    : log.level === 'WARN'
                      ? 'bg-warning-soft text-warning'
                      : log.level === 'DEBUG'
                        ? 'bg-accent-soft text-accent'
                        : 'bg-white/60 text-muted-foreground'
                }`}
              >
                {log.level}
              </span>
              <span className="text-muted-foreground">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-accent/70">[{log.category}]</span>
            </div>
            <div className="break-words leading-relaxed text-foreground">{log.message}</div>
            {log.data !== undefined && log.data !== null && (
              <pre className="code-panel mt-1 overflow-x-auto rounded-lg p-2 text-muted-foreground">
                {String(JSON.stringify(log.data, null, 2))}
              </pre>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-white/60 bg-white/35 px-4 py-2">
        <span className="text-xs text-muted-foreground">显示最近 100 条日志</span>
        <button
          onClick={() => clearDebugLogs()}
          className="text-xs font-semibold text-accent hover:text-accent-strong"
        >
          清空日志
        </button>
      </div>
    </div>
  )
}
