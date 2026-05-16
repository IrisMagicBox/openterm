import { Plus, Search, Server, Monitor } from 'lucide-react'
import { useState } from 'react'
import { HostCard } from '../hosts/HostCard'
import { Host, Topic } from '../../../../shared/types'
import { WORKSPACE_TERMINALS_TOPIC_ID } from '../../../../shared/constants'
import { TerminalTab, View } from '../../types'
import { LOCAL_HOST } from '../../constants'
import { PortForwardingPanel } from '../terminal/PortForwardingPanel'
import { Button, Dialog, DialogContent, IconButton, Input, PageHeader, Surface } from '../ui'
import { upsertTerminalTab } from '../../lib/terminal-tabs'

interface HostsViewProps {
  filteredHosts: Host[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  setShowAddHost: (v: boolean) => void
  setSelectedHost: (h: Host | null) => void
  setTerminalSessionId: (id: string | null) => void
  setTerminalTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>
  setActiveTerminalTabIndex: (i: number) => void
  setActiveView: (v: View) => void
  topics: Topic[]
  setTopics: React.Dispatch<React.SetStateAction<Topic[]>>
  setSelectedTopic: (t: Topic) => void
  setPrefilledText: (text: string) => void
  setFileBrowserHostId: (id: string | null) => void
  setFileBrowserHostAlias: (alias: string) => void
  handleDeleteHost: (id: string) => Promise<void>
  onEditHost: (host: Host) => void
  onCreateLocalAgentTopic: () => Promise<unknown>
}

export function HostsView({
  filteredHosts,
  searchQuery,
  setSearchQuery,
  setShowAddHost,
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
  onEditHost,
  onCreateLocalAgentTopic
}: HostsViewProps): React.ReactElement {
  const [portForwardHost, setPortForwardHost] = useState<Host | null>(null)

  const addTerminalTab = (tab: TerminalTab): void => {
    setTerminalTabs((prev) => {
      const next = upsertTerminalTab(prev, tab)
      const tabIndex = next.findIndex((item) => item.sessionId === tab.sessionId)
      setActiveTerminalTabIndex(tabIndex >= 0 ? tabIndex : 0)
      return next
    })
  }

  const openLocalTerminal = async (): Promise<void> => {
    try {
      const session = await window.api.connectLocal(WORKSPACE_TERMINALS_TOPIC_ID)
      setSelectedHost(LOCAL_HOST)
      setTerminalSessionId(session.id)
      addTerminalTab({ host: LOCAL_HOST, sessionId: session.id })
      setActiveView('terminal')
    } catch (e) {
      console.error('Local terminal connection failed:', e)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent">
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
        <Surface className="mb-5 hover:border-success/30 hover:bg-white/80">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success shadow-sm shadow-success/10">
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
              <IconButton aria-label="打开本机终端" onClick={openLocalTerminal} variant="primary">
                <Monitor size={14} />
              </IconButton>
            </div>
          </div>
        </Surface>

        {filteredHosts.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/75 bg-white/70 text-muted-foreground shadow-sm backdrop-blur-xl">
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
                onEdit={() => onEditHost(host)}
                onDelete={async () => {
                  await handleDeleteHost(host.id)
                }}
                onConnect={async () => {
                  try {
                    const sessionId = await window.api.connectSSH(
                      host.id,
                      WORKSPACE_TERMINALS_TOPIC_ID
                    )
                    setSelectedHost(host)
                    setTerminalSessionId(sessionId)
                    addTerminalTab({ host, sessionId })
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
                onPortForward={() => setPortForwardHost(host)}
              />
            ))}
          </div>
        )}
      </div>
      {portForwardHost && (
        <Dialog open onOpenChange={(open) => !open && setPortForwardHost(null)}>
          <DialogContent className="h-[520px] max-w-2xl overflow-hidden p-0" showClose={false}>
            <PortForwardingPanel
              hostId={portForwardHost.id}
              hostAlias={portForwardHost.alias}
              onClose={() => setPortForwardHost(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
