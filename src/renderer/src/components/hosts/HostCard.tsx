import { Server, Trash2, Terminal as TerminalIcon, Folder, Zap } from 'lucide-react'
import type { Host } from '../../../../shared/types'

interface HostCardProps {
  host: Host
  onConnect: () => void
  onDelete: () => void
  onAgentClick: () => void
  onFileBrowser: () => void
}

export function HostCard({
  host,
  onConnect,
  onDelete,
  onAgentClick,
  onFileBrowser
}: HostCardProps) {
  return (
    <div className="group relative bg-white rounded-3xl p-7 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-100 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-3xl" />

      <button
        onClick={onDelete}
        className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
      >
        <Trash2 size={14} />
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
          <Server size={26} />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="text-base font-black text-gray-900 truncate" title={host.alias}>
            {host.alias}
          </h3>
          <span
            className="text-xs font-mono text-gray-400 truncate block"
            title={`${host.username}@${host.ip}:${host.port || 22}`}
          >
            {host.username}@{host.ip}:{host.port || 22}
          </span>
        </div>
      </div>

      {host.tags && host.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {host.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full uppercase tracking-widest"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2.5 mt-auto">
        <button
          onClick={onConnect}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-700 transition active:scale-95"
        >
          <TerminalIcon size={13} /> 终端
        </button>
        <button
          onClick={onFileBrowser}
          className="py-2.5 px-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gray-200 transition active:scale-95"
          title="文件管理"
        >
          <Folder size={13} />
        </button>
        <button
          onClick={onAgentClick}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition active:scale-95 shadow-md shadow-blue-500/20"
        >
          <Zap size={13} /> 助手
        </button>
      </div>
    </div>
  )
}
