import { Plus, Search, Server, Monitor } from 'lucide-react'
import { HostCard } from '../hosts/HostCard'
import { Host, Topic } from '../../../../shared/types'
import { View } from '../../types'
import { LOCAL_HOST } from '../../constants'
import { useConfirm } from '../../hooks/useConfirm'
import { Button, IconButton, Input, PageHeader, Surface } from '../ui'

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
  onCreateLocalAgentTopic: () => Promise<unknown>
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
}: HostsViewProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()

  return (
    <div className="flex-1 overflow-y-auto bg-app">
      <PageHeader
        title="主机"
        description="管理远程 SSH 终点和本机工作区"
        className="sticky top-0 z-10"
        actions={
          <>
            <div className="relative w-56">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                placeholder="搜索主机..."
              />
            </div>
            <Button onClick={() => setShowAddHost(true)} variant="primary">
              <Plus size={16} /> 添加主机
            </Button>
          </>
        }
      />

      <div className="px-6 py-5">
        <Surface
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
          role="button"
          tabIndex={0}
          className="mb-5 cursor-pointer transition-colors hover:border-success/30"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
              <Monitor size={22} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground">本机终端</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">快速打开本地 Shell 终端</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={async (e) => {
                  e.stopPropagation()
                  await onCreateLocalAgentTopic()
                }}
                variant="secondary"
                size="sm"
              >
                Agent 对话
              </Button>
              <IconButton aria-label="打开本机终端" variant="primary">
                <Monitor size={14} />
              </IconButton>
            </div>
          </div>
        </Surface>

        {filteredHosts.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
              <Server size={28} />
            </div>
            <h3 className="text-lg font-bold text-foreground">暂无主机</h3>
            <p className="mb-5 mt-2 text-sm text-muted-foreground">
              添加您的第一个 SSH 服务器以开始
            </p>
            <Button onClick={() => setShowAddHost(true)} variant="primary" size="lg">
              <Plus size={16} /> 添加第一个主机
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredHosts.map((host) => (
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
