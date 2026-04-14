import { Plus, Search, Server, Monitor } from 'lucide-react'
import { HostCard } from '../hosts/HostCard'
import { Host, Topic } from '../../../../shared/types'
import { View } from '../../types'
import { LOCAL_HOST } from '../../constants'
import { useConfirm } from '../../hooks/useConfirm'

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
  onCreateLocalAgentTopic: () => Promise<any>
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
  handleDeleteHost,
  onCreateLocalAgentTopic
}: HostsViewProps) {
  const { confirm, ConfirmDialogComponent } = useConfirm()

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
        {ConfirmDialogComponent}
      </div>

      <div className="px-10 py-8">
        <div
          onClick={async () => {
            try {
              const session = await window.api.connectLocal(selectedTopic?.id || '')
              setSelectedHost(LOCAL_HOST)
              setTerminalSessionId(session.id)
              setTerminalTabs((prev) => {
                setActiveTerminalTabIndex(prev.length)
                return [...prev, { host: LOCAL_HOST, sessionId: session.id }]
              })
              setActiveView('terminal')
            } catch (e) {
              console.error('Local terminal connection failed:', e)
            }
          }}
          className="group relative w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-3xl p-7 border border-emerald-300/40 shadow-lg shadow-emerald-500/10 hover:shadow-xl hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden mb-8 text-left cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-3xl" />
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="absolute bottom-0 left-1/2 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />

          <div className="relative flex items-center gap-5">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-700/20 group-hover:scale-105 transition-transform duration-300">
              <Monitor size={30} strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-black text-white tracking-tight">本机终端</h3>
              <p className="text-sm text-emerald-100/80 mt-0.5 font-medium">
                快速打开本地 Shell 终端
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  console.log('[HostsView] onCreateLocalAgentTopic trigger')
                  await onCreateLocalAgentTopic()
                }}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl transition backdrop-blur-sm border border-white/20"
              >
                Agent 对话
              </button>
              <div className="text-white/50 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all duration-300">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7.5 5L12.5 10L7.5 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

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
            {filteredHosts
              .filter((h) => h.id !== 'local')
              .map((host) => (
                <HostCard
                  key={host.id}
                  host={host}
                  onDelete={async () => {
                  const ok = await confirm({
                    title: '删除主机',
                    message: `确定要删除主机 "${host.alias}" 吗？此操作不可恢复。`,
                    confirmText: '删除',
                    variant: 'danger'
                  })
                  if (ok) {
                    await handleDeleteHost(host.id)
                  }
                }}
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
      {ConfirmDialogComponent}
    </div>
  )
}
