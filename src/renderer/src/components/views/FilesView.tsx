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
}: FilesViewProps): React.ReactElement {
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

  useEffect(() => {
    openFileTabRef.current = paneManager.openFileTab
    focusTabRef.current = paneManager.focusTab
    getAllTabsRef.current = paneManager.getAllTabs
  }, [paneManager.openFileTab, paneManager.focusTab, paneManager.getAllTabs])

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
          className={`flex h-full flex-col bg-workspace relative transition-colors ${
            paneManager.focusedLeafId === leaf.id ? 'ring-1 ring-inset ring-accent/60' : ''
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {tabs.length > 0 && (
            <div className="flex items-center overflow-x-auto border-b border-workspace-border bg-workspace-muted px-1 pt-0.5 no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.tabId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.tabId)}
                  onClick={() => paneManager.focusTab(tab.tabId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.tabId
                      ? 'text-workspace-foreground border-accent bg-workspace'
                      : 'text-workspace-muted-foreground border-transparent hover:text-workspace-foreground hover:bg-workspace/70'
                  }`}
                >
                  <Folder size={10} />
                  <span>{tab.hostAlias}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(tab.tabId)
                    }}
                    className="ml-1 rounded p-0.5 text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-workspace-foreground"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowHostPicker(true)}
                className="flex items-center justify-center rounded px-2 py-1.5 text-xs text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
                title="打开文件管理"
              >
                <Plus size={12} />
              </button>
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
    <div className="flex-1 flex flex-col overflow-hidden bg-workspace">
      <div className="flex flex-col flex-shrink-0 border-b border-workspace-border bg-workspace-muted/85 backdrop-blur-2xl">
        <div className="h-11 text-workspace-foreground px-5 flex items-center justify-between flex-shrink-0 drag">
          <div className="flex items-center gap-3 no-drag">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <div className="w-3 h-3 bg-yellow-400 rounded-full" />
              <div className="w-3 h-3 bg-emerald-400 rounded-full" />
            </div>
            <div className="w-px h-4 bg-workspace-border" />
            <Folder size={13} className="text-accent" />
            <span className="text-xs font-semibold font-mono text-workspace-foreground">
              {activeTab?.hostAlias || '文件管理'}
            </span>
            <span className="text-xs text-workspace-muted-foreground font-mono">文件管理</span>
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
              onClick={() => setShowFileList(!showFileList)}
              className="flex items-center gap-1 rounded-md bg-workspace px-2.5 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
              title="文件列表"
            >
              <LayoutGrid size={12} />
            </button>
            <button
              onClick={() => setShowHostPicker(true)}
              className="flex items-center gap-1.5 rounded-md bg-workspace px-2.5 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-accent"
              title="打开文件管理"
            >
              <Plus size={12} /> 新建
            </button>
            <button
              onClick={handleDisconnectAll}
              className="flex items-center gap-1.5 rounded-md bg-workspace px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-danger/15 hover:text-danger"
            >
              <X size={12} /> 关闭全部
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {paneManager.isEmpty ? (
          <div className="flex-1 flex items-center justify-center bg-workspace h-full">
            <div className="text-center">
              <Folder size={40} className="text-workspace-border mx-auto mb-4" />
              <p className="text-workspace-muted-foreground text-sm font-semibold mb-4">
                无活跃文件管理
              </p>
              <button
                onClick={() => setShowHostPicker(true)}
                className="mx-auto flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-strong"
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
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/10 backdrop-blur-lg"
          onClick={() => setShowFileList(false)}
        >
          <div
            className="glass-menu mx-4 w-full max-w-2xl rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-workspace-foreground font-bold text-sm mb-4 flex items-center gap-2">
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
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/70 bg-white/60 p-3 transition hover:border-accent/25 hover:bg-accent-soft/45"
                >
                  <Folder size={16} className="text-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-semibold text-workspace-foreground">
                      {tab.hostAlias}
                    </div>
                    <div className="font-mono text-xs text-workspace-muted-foreground">
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
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/10 backdrop-blur-lg"
          onClick={() => setShowHostPicker(false)}
        >
          <div
            className="glass-menu mx-4 w-full max-w-lg rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-workspace-foreground font-bold text-sm mb-4 flex items-center gap-2">
              <Monitor size={14} /> 选择主机
            </h3>
            {hosts.length === 0 ? (
              <p className="text-workspace-muted-foreground text-xs">暂无可用主机</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                {hosts.map((host) => {
                  const isOpen = allTabs.some((t) => t.hostId === host.id)
                  return (
                    <div
                      key={host.id}
                      onClick={() => handleOpenHost(host)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        isOpen
                          ? 'border-accent/25 bg-accent-soft/60'
                          : 'border-white/70 bg-white/60 hover:border-accent/25 hover:bg-accent-soft/45'
                      }`}
                    >
                      <Folder size={16} className="text-accent" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-xs font-semibold text-workspace-foreground">
                          {host.alias}
                        </div>
                        <div className="font-mono text-xs text-workspace-muted-foreground">
                          {host.id === 'local'
                            ? '本机'
                            : `${host.username}@${host.ip}${host.port && host.port !== 22 ? `:${host.port}` : ''}`}
                        </div>
                      </div>
                      {isOpen && <span className="text-xs text-accent font-semibold">已打开</span>}
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
