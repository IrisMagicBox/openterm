import { useState, useCallback, useRef, useEffect } from 'react'
import { Terminal as TerminalIcon, X, Folder, LayoutGrid, Columns, Rows } from 'lucide-react'
import { TerminalView } from '../TerminalView'
import { FileBrowser } from '../terminal/FileBrowser'
import { Host } from '../../../../shared/types'
import { View } from '../../types'
import { SplitPane } from '../SplitPane'
import { PaneLeaf } from '../../types/pane'
import { useTerminalPaneManager, TerminalTab } from '../../hooks/useTerminalPaneManager'
import { useConfirm } from '../../hooks/useConfirm'
import { useFileTransfer } from '../../hooks/useFileTransfer'
import { FileTransferToast } from '../FileTransferToast'

interface TerminalLayoutProps {
  terminalTabs: TerminalTab[]
  setTerminalTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>
  activeTerminalTabIndex: number
  setActiveTerminalTabIndex: (i: number) => void
  selectedHost: Host | null
  setSelectedHost: (h: Host | null) => void
  terminalSessionId: string | null
  setTerminalSessionId: (id: string | null) => void
  terminalFontSize: number
  setTerminalFontSize: (s: number) => void
  setActiveView: (v: View) => void
  fileBrowserHostId: string | null
  setFileBrowserHostId: (id: string | null) => void
  fileBrowserHostAlias: string
  setFileBrowserHostAlias: (alias: string) => void
}

export function TerminalLayout({
  terminalTabs: legacyTabs,
  setTerminalTabs: setLegacyTabs,
  selectedHost,
  setSelectedHost,
  terminalFontSize,
  setTerminalFontSize,
  setActiveView,
  fileBrowserHostId,
  setFileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostAlias
}: TerminalLayoutProps): React.ReactElement {
  const paneManager = useTerminalPaneManager()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showTerminalList, setShowTerminalList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)

  const syncedSessionIds = useRef<Set<string>>(new Set())
  const openTerminalRef = useRef(paneManager.openTerminal)

  useEffect(() => {
    openTerminalRef.current = paneManager.openTerminal
  }, [paneManager.openTerminal])

  useEffect(() => {
    for (const tab of legacyTabs) {
      if (!syncedSessionIds.current.has(tab.sessionId)) {
        syncedSessionIds.current.add(tab.sessionId)
        openTerminalRef.current(tab.host, tab.sessionId)
      }
    }
  }, [legacyTabs])

  const activeTab = paneManager
    .getLeaves()
    .flatMap((leaf) =>
      leaf.activeTabId ? [paneManager.getTabData(leaf.activeTabId)].filter(Boolean) : []
    )[0]

  const handleSplit = useCallback(
    (paneId: string, direction: 'horizontal' | 'vertical') => {
      const leaves = paneManager.getLeaves()
      const sourceLeaf = leaves.find((l) => l.id === paneId)
      if (!sourceLeaf || sourceLeaf.tabIds.length < 2) return
      const lastTabId = sourceLeaf.tabIds[sourceLeaf.tabIds.length - 1]
      paneManager.splitPaneWithTab(paneId, direction, lastTabId)
    },
    [paneManager]
  )

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const ok = await confirm({
        title: '关闭终端',
        message: '确定关闭终端标签页？',
        confirmText: '关闭',
        variant: 'danger'
      })
      if (!ok) return
      paneManager.closeTerminalTab(tabId)
      if (paneManager.isEmpty) {
        setLegacyTabs([])
        setActiveView('hosts')
        setSelectedHost(null)
      }
    },
    [confirm, paneManager, setLegacyTabs, setActiveView, setSelectedHost]
  )

  const handleDisconnectAll = useCallback(async () => {
    const ok = await confirm({
      title: '断开全部',
      message: '确定断开所有终端连接？',
      confirmText: '断开',
      variant: 'danger'
    })
    if (!ok) return
    setLegacyTabs([])
    setActiveView('hosts')
    setSelectedHost(null)
  }, [confirm, setLegacyTabs, setActiveView, setSelectedHost])

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handlePaneDragOver = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height
    const threshold = 40

    if (y < threshold) setDragOverEdge('top')
    else if (y > h - threshold) setDragOverEdge('bottom')
    else if (x < threshold) setDragOverEdge('left')
    else if (x > w - threshold) setDragOverEdge('right')
    else setDragOverEdge(null)

    setDragOverPaneId(paneId)
  }, [])

  const handlePaneDragLeave = useCallback(() => {
    setDragOverPaneId(null)
    setDragOverEdge(null)
  }, [])

  const handlePaneDrop = useCallback(
    (e: React.DragEvent, targetPaneId: string) => {
      e.preventDefault()
      const tabId = e.dataTransfer.getData('text/plain')
      if (!tabId) return

      const edge = dragOverEdge
      if (edge) {
        const direction = edge === 'top' || edge === 'bottom' ? 'vertical' : 'horizontal'
        paneManager.splitPaneWithTab(targetPaneId, direction, tabId)
      } else {
        const sourceLeaf = paneManager.findPaneForTab(tabId)
        if (sourceLeaf && sourceLeaf.id !== targetPaneId) {
          paneManager.moveTab(tabId, sourceLeaf.id, targetPaneId)
        }
      }
      setDragOverPaneId(null)
      setDragOverEdge(null)
    },
    [dragOverEdge, paneManager]
  )

  const renderLeaf = useCallback(
    (leaf: PaneLeaf) => {
      const tabs = paneManager.getLeafTabs(leaf)

      return (
        <div
          className={`flex flex-col h-full bg-workspace transition-colors ${
            paneManager.focusedLeafId === leaf.id ? 'ring-1 ring-inset ring-accent/70' : ''
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {tabs.length > 1 && (
            <div className="flex items-center overflow-x-auto border-b border-workspace-border bg-workspace-muted px-1 pt-0.5 no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.sessionId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.sessionId)}
                  onClick={() => paneManager.focusTab(tab.sessionId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.sessionId
                      ? 'text-workspace-foreground border-accent bg-workspace'
                      : 'text-workspace-muted-foreground border-transparent hover:text-workspace-foreground hover:bg-workspace/70'
                  }`}
                >
                  <TerminalIcon size={10} />
                  <span>{tab.host.alias}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(tab.sessionId)
                    }}
                    className="ml-1 rounded p-0.5 text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-workspace-foreground"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {dragOverPaneId === leaf.id && dragOverEdge && (
            <div
              className={`absolute z-20 border-2 border-accent bg-accent/20 pointer-events-none ${
                dragOverEdge === 'top'
                  ? 'top-0 left-0 right-0 h-10'
                  : dragOverEdge === 'bottom'
                    ? 'bottom-0 left-0 right-0 h-10'
                    : dragOverEdge === 'left'
                      ? 'top-0 left-0 bottom-0 w-10'
                      : 'top-0 right-0 bottom-0 w-10'
              }`}
            />
          )}

          <div className="flex-1 relative">
            {tabs.map((tab) => (
              <div
                key={tab.sessionId}
                className="absolute inset-0"
                style={{ display: leaf.activeTabId === tab.sessionId ? 'block' : 'none' }}
              >
                <TerminalView
                  id={tab.sessionId}
                  hostId={tab.host.id}
                  fontSize={terminalFontSize}
                  onClose={() => handleCloseTab(tab.sessionId)}
                  onFileDrop={(sourceHostId, sourcePath, fileName, destHostId, destPath) => {
                    const transferId = `ft-${Date.now()}-${Math.random().toString(36).slice(2)}`
                    const srcTab = paneManager.getAllTabs().find((t) => t.host.id === sourceHostId)
                    startTransfer(
                      transferId,
                      fileName,
                      srcTab?.host.alias || sourceHostId,
                      tab.host.alias,
                      sourceHostId,
                      sourcePath,
                      destHostId,
                      destPath
                    )
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )
    },
    [
      paneManager,
      terminalFontSize,
      handleCloseTab,
      handleTabDragStart,
      handlePaneDragOver,
      handlePaneDragLeave,
      handlePaneDrop,
      dragOverPaneId,
      dragOverEdge,
      startTransfer
    ]
  )

  const allTabs = paneManager.getAllTabs()

  return (
    <div className="flex-1 flex overflow-hidden bg-workspace">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-col flex-shrink-0 border-b border-workspace-border bg-workspace-muted">
          <div className="h-11 px-5 flex items-center justify-between flex-shrink-0 drag text-workspace-foreground">
            <div className="flex items-center gap-3 no-drag">
              <TerminalIcon size={13} className="text-accent" />
              <span className="font-mono text-xs font-semibold text-workspace-foreground">
                {activeTab?.host.alias || selectedHost?.alias}
              </span>
              <span className="font-mono text-xs text-workspace-muted-foreground">
                {activeTab?.host.id === 'local' || selectedHost?.id === 'local'
                  ? '本机'
                  : activeTab
                    ? `${activeTab.host.username}@${activeTab.host.ip}:${activeTab.host.port || 22}`
                    : selectedHost
                      ? `${selectedHost.username}@${selectedHost.ip}:${selectedHost.port || 22}`
                      : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 no-drag">
              <div className="mr-1 flex overflow-hidden rounded-md border border-workspace-border bg-workspace">
                <button
                  onClick={() => setTerminalFontSize(Math.max(terminalFontSize - 1, 6))}
                  className="px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition-colors hover:bg-workspace-border hover:text-workspace-foreground"
                  title="缩小"
                >
                  -
                </button>
                <div className="w-px bg-workspace-border" />
                <button
                  onClick={() => setTerminalFontSize(Math.min(terminalFontSize + 1, 30))}
                  className="px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition-colors hover:bg-workspace-border hover:text-workspace-foreground"
                  title="放大"
                >
                  +
                </button>
              </div>
              {allTabs.length > 0 && (
                <div className="flex gap-1">
                  {(() => {
                    const leafToSplit =
                      paneManager.getLeaves().find((l) => l.id === paneManager.focusedLeafId) ||
                      paneManager.getLeaves()[0]
                    return leafToSplit ? (
                      <>
                        <button
                          onClick={() => handleSplit(leafToSplit.id, 'horizontal')}
                          className="flex items-center gap-1 rounded-md bg-workspace px-2 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
                          title="水平分屏"
                        >
                          <Columns size={12} />
                        </button>
                        <button
                          onClick={() => handleSplit(leafToSplit.id, 'vertical')}
                          className="flex items-center gap-1 rounded-md bg-workspace px-2 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
                          title="垂直分屏"
                        >
                          <Rows size={12} />
                        </button>
                      </>
                    ) : null
                  })()}
                </div>
              )}
              <button
                onClick={() => setShowTerminalList(!showTerminalList)}
                className="flex items-center gap-1 rounded-md border border-workspace-border bg-workspace px-2.5 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
                title="终端列表"
              >
                <LayoutGrid size={12} />
              </button>
              <button
                onClick={() => {
                  if (activeTab?.host || selectedHost) {
                    const h = activeTab?.host || selectedHost!
                    setFileBrowserHostId(h.id)
                    setFileBrowserHostAlias(h.alias)
                  }
                }}
                className="flex items-center gap-1.5 rounded-md border border-workspace-border bg-workspace px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
                title="文件管理"
              >
                <Folder size={12} /> 文件
              </button>
              <button
                onClick={handleDisconnectAll}
                className="flex items-center gap-1.5 rounded-md border border-workspace-border bg-workspace px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-danger/10 hover:text-danger"
              >
                <X size={12} /> 断开全部
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col relative overflow-hidden">
          {paneManager.isEmpty ? (
            <div className="flex-1 flex items-center justify-center bg-white">
              <div className="text-center">
                <TerminalIcon size={40} className="text-workspace-border mx-auto mb-4" />
                <p className="text-workspace-muted-foreground text-sm font-semibold">无活跃终端</p>
              </div>
            </div>
          ) : (
            <SplitPane
              node={paneManager.root}
              renderLeaf={renderLeaf}
              onResizeSplit={paneManager.resizeSplit}
            />
          )}
        </div>

        {showTerminalList && allTabs.length > 0 && (
          <div
            className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center"
            onClick={() => setShowTerminalList(false)}
          >
            <div
              className="bg-workspace rounded-lg p-5 max-w-2xl w-full mx-4 border border-workspace-border"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-workspace-foreground font-bold text-sm mb-4 flex items-center gap-2">
                <LayoutGrid size={14} /> 终端列表 ({allTabs.length})
              </h3>
              <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                {allTabs.map((tab) => (
                  <div
                    key={tab.sessionId}
                    onClick={() => {
                      paneManager.focusTab(tab.sessionId)
                      setShowTerminalList(false)
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-md bg-workspace-muted p-3 transition hover:bg-workspace-border"
                  >
                    <TerminalIcon size={16} className="text-accent" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-semibold text-workspace-foreground">
                        {tab.host.alias}
                      </div>
                      <div className="font-mono text-xs text-workspace-muted-foreground">
                        {tab.host.id === 'local' ? '本机' : `${tab.host.username}@${tab.host.ip}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {fileBrowserHostId && (
        <div className="w-96 flex-shrink-0 border-l border-workspace-border bg-workspace">
          <FileBrowser
            hostId={fileBrowserHostId}
            hostAlias={fileBrowserHostAlias}
            onClose={() => {
              setFileBrowserHostId(null)
              setFileBrowserHostAlias('')
            }}
            onFileDrop={(sourceHostId, sourcePath, fileName, destHostId, destPath) => {
              const transferId = `ft-${Date.now()}-${Math.random().toString(36).slice(2)}`
              const currentTabs = paneManager.getAllTabs()
              const sourceAlias =
                currentTabs.find((t) => t.host.id === sourceHostId)?.host.alias || sourceHostId
              startTransfer(
                transferId,
                fileName,
                sourceAlias,
                fileBrowserHostAlias,
                sourceHostId,
                sourcePath,
                destHostId,
                destPath
              )
            }}
          />
        </div>
      )}

      {ConfirmDialogComponent}
      <FileTransferToast transfers={transfers} onRemove={removeTransfer} />
    </div>
  )
}
