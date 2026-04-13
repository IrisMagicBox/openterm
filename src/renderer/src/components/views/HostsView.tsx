import { Plus, Search, Server } from 'lucide-react'
import { HostCard } from '../hosts/HostCard'
import { Host, Topic } from '../../../../shared/types'
import { View } from '../../types'

interface HostsViewProps {
  filteredHosts: Host[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  setShowAddHost: (v: boolean) => void
  selectedTopic: { id: string } | null
  setSelectedHost: (h: Host | null) => void
  setTerminalSessionId: (id: string | null) => void
  setTerminalTabs: React.Dispatch<React.SetStateAction<{ host: Host; sessionId: string }[]>>
  setActiveTerminalTabIndex: (i: number) => void
  setActiveView: (v: View) => void
  topics: Topic[]
  setTopics: React.Dispatch<React.SetStateAction<Topic[]>>
  setSelectedTopic: (t: Topic) => void
  setPrefilledText: (text: string) => void
  setFileBrowserHostId: (id: string | null) => void
  setFileBrowserHostAlias: (alias: string) => void
  handleDeleteHost: (id: string) => Promise<void>
}

export function HostsView({
  filteredHosts,
  searchQuery,
  setSearchQuery,
  setShowAddHost,
  selectedTopic,
  setSelectedHost,
  setTerminalSessionId,
  setTerminalTabs,
  setActiveTerminalTabIndex,
  setActiveView,
  topics,
  setTopics,
  setSelectedTopic,
  setPrefilledText,
  setFileBrowserHostId,
  setFileBrowserHostAlias,
  handleDeleteHost
}: HostsViewProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/30">
      <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 px-10 py-5 flex items-center justify-between drag">
        <div className="no-drag">
          <h2 className="text-2xl font-black text-gray-900">主机</h2>
          <p className="text-sm text-gray-400 mt-0.5">管理您的远程 SSH 终点</p>
        </div>
        <div className="flex items-center gap-3 no-drag">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <Search size={15} className="text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-44 placeholder-gray-400"
              placeholder="搜索主机..."
            />
          </div>
          <button
            onClick={() => setShowAddHost(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <Plus size={16} /> 添加主机
          </button>
        </div>
      </div>

      <div className="px-10 py-8">
        {filteredHosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-gray-300 mb-5">
              <Server size={36} />
            </div>
            <h3 className="font-black text-gray-900 text-lg">暂无主机</h3>
            <p className="text-gray-400 text-sm mt-2 mb-6">添加您的第一个 SSH 服务器以开始</p>
            <button
              onClick={() => setShowAddHost(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
            >
              <Plus size={16} /> 添加第一个主机
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredHosts.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                onConnect={async () => {
                  try {
                    const topicId = selectedTopic?.id || ''
                    const sessionId = await window.api.connectSSH(host.id, topicId)
                    setSelectedHost(host)
                    setTerminalSessionId(sessionId)
                    setTerminalTabs((prev) => {
                      setActiveTerminalTabIndex(prev.length)
                      return [...prev, { host, sessionId }]
                    })
                    setActiveView('terminal')
                  } catch (e) {
                    console.error('SSH connection failed:', e)
                  }
                }}
                onAgentClick={async () => {
                  const title = `Session ${topics.length + 1}`
                  const topic = await window.api.createTopic(title, [host.id])
                  setTopics((prev) => [topic, ...prev])
                  setSelectedTopic(topic)
                  setPrefilledText(`@${host.alias} `)
                  setActiveView('chat')
                }}
                onDelete={() => handleDeleteHost(host.id)}
                onFileBrowser={async () => {
                  setFileBrowserHostId(host.id)
                  setFileBrowserHostAlias(host.alias)
                  setActiveView('files')
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
