import { X, Server, Minus, Plus } from 'lucide-react'
import type { Host, Topic } from '../../../../shared/types'

interface ManageHostsModalProps {
  topic: Topic
  allHosts: Host[]
  onClose: () => void
  onAddHost: (hostId: string) => void
  onRemoveHost: (hostId: string) => void
}

export function ManageHostsModal({
  topic,
  allHosts,
  onClose,
  onAddHost,
  onRemoveHost
}: ManageHostsModalProps) {
  const topicHosts = allHosts.filter((h) => topic.hostIds.includes(h.id))
  const availableHosts = allHosts.filter((h) => !topic.hostIds.includes(h.id))

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] border border-gray-100 w-full max-w-lg p-10 mx-4 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-black text-gray-900 text-lg">管理话题主机</h2>
            <p className="text-xs text-gray-400 mt-0.5">添加或移除此话题中的主机</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
              已连接主机
            </h3>
            {topicHosts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">暂无主机</p>
            ) : (
              <div className="space-y-2">
                {topicHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <Server size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{host.alias}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {host.ip}:{host.port || 22}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveHost(host.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                    >
                      <Minus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableHosts.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                可用主机
              </h3>
              <div className="space-y-2">
                {availableHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center">
                        <Server size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{host.alias}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {host.ip}:{host.port || 22}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onAddHost(host.id)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
