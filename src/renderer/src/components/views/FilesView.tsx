import { useState, useCallback, useRef, useEffect } from 'react'
import { Folder, X, Plus, LayoutGrid, Columns, Rows, Monitor } from 'lucide-react'
import { FileBrowser } from '../terminal/FileBrowser'
import { Host } from '../../../../shared/types'
import { View } from '../../types'
import { SplitPane } from '../SplitPane'
import { PaneLeaf } from '../../types/pane'
import { useFilePaneManager } from '../../hooks/useFilePaneManager'
import { useConfirm } from '../../hooks/useConfirm'
import { useFileTransfer } from '../../hooks/useFileTransfer'
import { FileTransferToast } from '../FileTransferToast'

interface FilesViewProps {
  fileBrowserHostId: string
  fileBrowserHostAlias: string
  setFileBrowserHostId: (id: string | null) => void
  setFileBrowserHostAlias: (alias: string) => void
  setActiveView: (v: View) => void
  hosts: Host[]
}

export function FilesView({
  fileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostId,
  setFileBrowserHostAlias,
  setActiveView,
  hosts
}: FilesViewProps) {
  const paneManager = useFilePaneManager()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showFileList, setShowFileList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)
  const [showHostPicker, setShowHostPicker] = useState(false)

  const openedHostIdsRef = useRef<Set<string>>(new Set())
  const openFileTabRef = useRef(paneManager.openFileTab)
  const focusTabRef = useRef(paneManager.focusTab)
  const getAllTabsRef = useRef(paneManager.getAllTabs)
  openFileTabRef.current = paneManager.openFileTab
  focusTabRef.current = paneManager.focusTab
  getAllTabsRef.current = paneManager.getAllTabs

  useEffect(() => {
    if (!fileBrowserHostId) return
    const allTabs = getAllTabsRef.current()
    const existingTab = allTabs.find((t) => t.hostId === fileBrowserHostId)
    if (existingTab) {
      focusTabRef.current(existingTab.tabId)
    } else {
      openFileTabRef.current(fileBrowserHostId, fileBrowserHostAlias)
      openedHostIdsRef.current.add(fileBrowserHostId)
    }
  }, [fileBrowserHostId, fileBrowserHostAlias])

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
        title: '关闭文件管理',
        message: '确定关闭文件管理标签页？',
        confirmText: '关闭',
        variant: 'danger'
      })
      if (!ok) return

      const tabData = paneManager.getTabData(tabId)
      paneManager.closeFileTab(tabId)
      if (tabData) {
        openedHostIdsRef.current.delete(tabData.hostId)
      }

      if (paneManager.isEmpty) {
        setFileBrowserHostId(null)
        setFileBrowserHostAlias('')
        setActiveView('hosts')
      }
    },
    [confirm, paneManager, setFileBrowserHostId, setFileBrowserHostAlias, setActiveView]
  )

  const handleDisconnectAll = useCallback(async () => {
    const ok = await confirm({
      title: '关闭全部',
      message: '确定关闭所有文件管理标签页？',
      confirmText: '关闭',
      variant: 'danger'
    })
    if (!ok) return
    const allTabs = paneManager.getAllTabs()
    for (const tab of allTabs) {
      paneManager.closeFileTab(tab.tabId)
    }
    openedHostIdsRef.current.clear()
    setFileBrowserHostId(null)
    setFileBrowserHostAlias('')
    setActiveView('hosts')
  }, [confirm, paneManager, setFileBrowserHostId, setFileBrowserHostAlias, setActiveView])

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handlePaneDragOver = useCallback((e: React.DragEvent, paneId: string) => {
    if (!e.dataTransfer.types.includes('text/plain')) return
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
      if (!e.dataTransfer.types.includes('text/plain')) return
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

  const handleOpenHost = useCallback(
    (host: Host) => {
      const allTabs = paneManager.getAllTabs()
      const existingTab = allTabs.find((t) => t.hostId === host.id)
      if (existingTab) {
        paneManager.focusTab(existingTab.tabId)
      } else {
        paneManager.openFileTab(host.id, host.alias)
        openedHostIdsRef.current.add(host.id)
      }
      setShowHostPicker(false)
    },
    [paneManager]
  )

  const renderLeaf = useCallback(
    (leaf: PaneLeaf) => {
      const tabs = paneManager.getLeafTabs(leaf)

      return (
        <div
          className={`flex flex-col h-full bg-[#1a1b1e] relative transition-colors ${
            paneManager.focusedLeafId === leaf.id ? 'ring-1 ring-inset ring-blue-500/30' : ''
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {tabs.length > 0 && (
            <div className="flex items-center bg-gray-900 border-b border-gray-700/50 px-1 pt-0.5 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.tabId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.tabId)}
                  onClick={() => paneManager.focusTab(tab.tabId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.tabId
                      ? 'text-white border-blue-500 bg-gray-800/50'
                      : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/30'
                  }`}
                >
                  <Folder size={10} />
                  <span>{tab.hostAlias}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(tab.tabId)
                    }}
                    className="ml-1 p-0.5 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowHostPicker(true)}
                className="flex items-center justify-center px-2 py-1.5 text-xs text-gray-500 hover:text-blue-400 hover:bg-gray-800/30 transition rounded"
                title="打开文件管理"
              >
                <Plus size={12} />
              </button>
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
                key={tab.tabId}
                className="absolute inset-0"
                style={{ display: leaf.activeTabId === tab.tabId ? 'block' : 'none' }}
              >
                <FileBrowser
                  hostId={tab.hostId}
                  hostAlias={tab.hostAlias}
                  onClose={() => handleCloseTab(tab.tabId)}
                  onFileDrop={(sourceHostId, sourcePath, fileName, destHostId, destPath) => {
                    const transferId = `ft-${Date.now()}-${Math.random().toString(36).slice(2)}`
                    const currentTabs = paneManager.getAllTabs()
                    const sourceAlias =
                      currentTabs.find((t) => t.hostId === sourceHostId)?.hostAlias || sourceHostId
                    startTransfer(
                      transferId,
                      fileName,
                      sourceAlias,
                      tab.hostAlias,
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
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-gray-900 flex flex-col flex-shrink-0">
        <div className="h-11 text-white px-5 flex items-center justify-between flex-shrink-0 drag">
          <div className="flex items-center gap-3 no-drag">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <div className="w-3 h-3 bg-yellow-400 rounded-full" />
              <div className="w-3 h-3 bg-emerald-400 rounded-full" />
            </div>
            <div className="w-px h-4 bg-gray-700" />
            <Folder size={13} className="text-blue-400" />
            <span className="text-xs font-bold font-mono text-gray-300">
              {activeTab?.hostAlias || '文件管理'}
            </span>
            <span className="text-[10px] text-gray-600 font-mono">文件管理</span>
          </div>
          <div className="flex items-center gap-2 no-drag">
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
              onClick={() => setShowFileList(!showFileList)}
              className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-blue-400 px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
              title="文件列表"
            >
              <LayoutGrid size={12} />
            </button>
            <button
              onClick={() => setShowHostPicker(true)}
              className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-blue-400 px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
              title="打开文件管理"
            >
              <Plus size={12} /> 新建
            </button>
            <button
              onClick={handleDisconnectAll}
              className="text-[11px] bg-gray-800 hover:bg-red-900/60 text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
            >
              <X size={12} /> 关闭全部
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {paneManager.isEmpty ? (
          <div className="flex-1 flex items-center justify-center bg-[#1a1b1e] h-full">
            <div className="text-center">
              <Folder size={40} className="text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 text-sm font-bold mb-4">无活跃文件管理</p>
              <button
                onClick={() => setShowHostPicker(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-2 mx-auto"
              >
                <Plus size={14} /> 打开文件管理
              </button>
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

      {showFileList && allTabs.length > 0 && (
        <div
          className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center"
          onClick={() => setShowFileList(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full mx-4 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-black text-sm mb-4 flex items-center gap-2">
              <LayoutGrid size={14} /> 文件管理列表 ({allTabs.length})
            </h3>
            <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
              {allTabs.map((tab) => (
                <div
                  key={tab.tabId}
                  onClick={() => {
                    paneManager.focusTab(tab.tabId)
                    setShowFileList(false)
                  }}
                  className="p-3 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700 transition flex items-center gap-3"
                >
                  <Folder size={16} className="text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">{tab.hostAlias}</div>
                    <div className="text-gray-500 text-[10px] font-mono">
                      {tab.hostId === 'local' ? '本机' : tab.hostId}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showHostPicker && (
        <div
          className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center"
          onClick={() => setShowHostPicker(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full mx-4 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-black text-sm mb-4 flex items-center gap-2">
              <Monitor size={14} /> 选择主机
            </h3>
            {hosts.length === 0 ? (
              <p className="text-gray-500 text-xs">暂无可用主机</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                {hosts.map((host) => {
                  const isOpen = allTabs.some((t) => t.hostId === host.id)
                  return (
                    <div
                      key={host.id}
                      onClick={() => handleOpenHost(host)}
                      className={`p-3 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                        isOpen
                          ? 'bg-gray-800/50 border border-gray-700/50'
                          : 'bg-gray-800 hover:bg-gray-700'
                      }`}
                    >
                      <Folder size={16} className="text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-bold truncate">{host.alias}</div>
                        <div className="text-gray-500 text-[10px] font-mono">
                          {host.id === 'local'
                            ? '本机'
                            : `${host.username}@${host.ip}${host.port && host.port !== 22 ? `:${host.port}` : ''}`}
                        </div>
                      </div>
                      {isOpen && (
                        <span className="text-[10px] text-blue-400 font-bold">已打开</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {ConfirmDialogComponent}
      <FileTransferToast transfers={transfers} onRemove={removeTransfer} />
    </div>
  )
}
