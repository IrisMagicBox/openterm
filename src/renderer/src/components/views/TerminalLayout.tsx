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
  terminalTabs: _legacyTabs,
  setTerminalTabs: setLegacyTabs,
  activeTerminalTabIndex: _legacyIndex,
  setActiveTerminalTabIndex: _setLegacyIndex,
  selectedHost,
  setSelectedHost,
  terminalSessionId: _legacySessionId,
  setTerminalSessionId: _setLegacySessionId,
  terminalFontSize,
  setTerminalFontSize,
  setActiveView,
  fileBrowserHostId,
  setFileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostAlias
}: TerminalLayoutProps) {
  const paneManager = useTerminalPaneManager()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showTerminalList, setShowTerminalList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)

  const syncedSessionIds = useRef<Set<string>>(new Set())
  const openTerminalRef = useRef(paneManager.openTerminal)
  openTerminalRef.current = paneManager.openTerminal

  useEffect(() => {
    for (const tab of _legacyTabs) {
      if (!syncedSessionIds.current.has(tab.sessionId)) {
        syncedSessionIds.current.add(tab.sessionId)
        openTerminalRef.current(tab.host, tab.sessionId)
      }
    }
  }, [_legacyTabs])

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
          className={`flex flex-col h-full bg-white transition-colors ${
            paneManager.focusedLeafId === leaf.id ? 'ring-1 ring-inset ring-blue-500/50' : ''
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {tabs.length > 1 && (
            <div className="flex items-center bg-gray-100 border-b border-gray-200 px-1 pt-0.5 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.sessionId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.sessionId)}
                  onClick={() => paneManager.focusTab(tab.sessionId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.sessionId
                      ? 'text-blue-600 border-blue-500 bg-white'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <TerminalIcon size={10} />
                  <span>{tab.host.alias}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(tab.sessionId)
                    }}
                    className="ml-1 p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {dragOverPaneId === leaf.id && dragOverEdge && (
            <div
              className={`absolute z-20 bg-blue-500/20 border-2 border-blue-400 pointer-events-none ${
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
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-gray-50 flex flex-col flex-shrink-0 border-b border-gray-200">
          <div className="h-11 text-gray-800 px-5 flex items-center justify-between flex-shrink-0 drag">
            <div className="flex items-center gap-3 no-drag">
              <TerminalIcon size={13} className="text-blue-500" />
              <span className="text-xs font-bold font-mono text-gray-800">
                {activeTab?.host.alias || selectedHost?.alias}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
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
              <div className="flex bg-white rounded-lg overflow-hidden border border-gray-200 mr-1 shadow-sm">
                <button
                  onClick={() => setTerminalFontSize(Math.max(terminalFontSize - 1, 6))}
                  className="px-3 py-1.5 text-xs font-black hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
                  title="缩小"
                >
                  -
                </button>
                <div className="w-[1px] bg-gray-200" />
                <button
                  onClick={() => setTerminalFontSize(Math.min(terminalFontSize + 1, 30))}
                  className="px-3 py-1.5 text-xs font-black hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
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
                          className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-blue-400 px-2 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
                          title="水平分屏"
                        >
                          <Columns size={12} />
                        </button>
                        <button
                          onClick={() => handleSplit(leafToSplit.id, 'vertical')}
                          className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-blue-400 px-2 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
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
                className="text-[11px] bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600 hover:text-blue-500 px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
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
                className="text-[11px] bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600 hover:text-blue-500 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
                title="文件管理"
              >
                <Folder size={12} /> 文件
              </button>
              <button
                onClick={handleDisconnectAll}
                className="text-[11px] bg-white border border-gray-200 shadow-sm hover:bg-red-50 text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
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
                <TerminalIcon size={40} className="text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 text-sm font-bold">无活跃终端</p>
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
              className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full mx-4 border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-black text-sm mb-4 flex items-center gap-2">
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
                    className="p-3 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700 transition flex items-center gap-3"
                  >
                    <TerminalIcon size={16} className="text-blue-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{tab.host.alias}</div>
                      <div className="text-gray-500 text-[10px] font-mono">
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
        <div className="w-96 border-l border-gray-200 flex-shrink-0 bg-white">
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
