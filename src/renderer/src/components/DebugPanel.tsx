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
}: DebugPanelProps) {
  if (!showDebug) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[400px] max-h-[500px] bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-blue-400" />
          <h3 className="text-xs font-black text-white uppercase tracking-widest">系统调试信息</h3>
        </div>
        <button
          onClick={() => setShowDebug(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[10px]">
        {debugLogs.length === 0 && (
          <div className="text-gray-600 italic text-center py-10">等待日志输入...</div>
        )}
        {debugLogs.map((log, i) => (
          <div key={i} className="flex flex-col gap-1 border-l-2 border-gray-800 pl-3 py-1">
            <div className="flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
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
        <span className="text-[9px] text-gray-500">显示最近 100 条日志</span>
        <button
          onClick={() => clearDebugLogs()}
          className="text-[9px] text-blue-500 hover:text-blue-400 font-bold"
        >
          清空日志
        </button>
      </div>
    </div>
  )
}
