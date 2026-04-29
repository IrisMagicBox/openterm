import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Folder, X, Plus, LayoutGrid, Columns, Rows, Monitor } from 'lucide-react'
import { FileBrowser } from '../terminal/FileBrowser'
import { Host } from '../../../../shared/types'
import { View, WorkspaceWindowItem } from '../../types'
import { SplitPane } from '../SplitPane'
import { PaneLeaf } from '../../types/pane'
import { FileTab, useFilePaneManager } from '../../hooks/useFilePaneManager'
import { useFileTransfer } from '../../hooks/useFileTransfer'
import { FileTransferToast } from '../FileTransferToast'
import { ConfirmActionButton } from '../ui'
import {
  paneDropPreviewClass,
  resolvePaneDropEdgeFromPoint,
  type PaneDropEdge
} from '../../lib/pane-drop'
import { LOCAL_HOST } from '../../constants'

interface FilesViewProps {
  fileBrowserHostId: string
  fileBrowserHostAlias: string
  setFileBrowserHostId: (id: string | null) => void
  setFileBrowserHostAlias: (alias: string) => void
  setActiveView: (v: View) => void
  hosts: Host[]
  focusFileRequest?: { tabId: string; requestId: number } | null
  closeFileRequest?: { tabId: string; requestId: number } | null
  renameFileRequest?: { tabId: string; title: string; requestId: number } | null
  onFileWindowsChange?: (items: WorkspaceWindowItem[]) => void
  onActiveFileWindowChange?: (id: string | null) => void
}

function toFileWindowItem(tab: FileTab): WorkspaceWindowItem {
  return {
    id: tab.tabId,
    title: tab.title || tab.hostAlias,
    subtitle: tab.hostId === 'local' ? '本机' : tab.hostId
  }
}

export function FilesView({
  fileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostId,
  setFileBrowserHostAlias,
  setActiveView,
  hosts,
  focusFileRequest,
  closeFileRequest,
  renameFileRequest,
  onFileWindowsChange,
  onActiveFileWindowChange
}: FilesViewProps): React.ReactElement {
  const paneManager = useFilePaneManager()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showFileList, setShowFileList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<PaneDropEdge | null>(null)
  const [showHostPicker, setShowHostPicker] = useState(false)
  const selectableHosts = useMemo(
    () => (hosts.some((host) => host.id === LOCAL_HOST.id) ? hosts : [LOCAL_HOST, ...hosts]),
    [hosts]
  )

  const openedHostIdsRef = useRef<Set<string>>(new Set())
  const openFileTabRef = useRef(paneManager.openFileTab)
  const focusFileTabRef = useRef<(tabId: string) => void>(() => {})
  const getAllTabsRef = useRef(paneManager.getAllTabs)
  const emitFileWindowsChangeRef = useRef<() => void>(() => {})
  const lastFocusRequestId = useRef<number | null>(null)
  const lastCloseRequestId = useRef<number | null>(null)
  const lastRenameRequestId = useRef<number | null>(null)

  const emitFileWindowsChange = useCallback(() => {
    onFileWindowsChange?.(paneManager.getAllTabs().map(toFileWindowItem))
  }, [onFileWindowsChange, paneManager])

  const syncFileSelection = useCallback(
    (tabId: string) => {
      const tab = paneManager.getTabData(tabId)
      if (!tab) return

      setFileBrowserHostId(tab.hostId)
      setFileBrowserHostAlias(tab.hostAlias)
      onActiveFileWindowChange?.(tabId)
    },
    [paneManager, setFileBrowserHostId, setFileBrowserHostAlias, onActiveFileWindowChange]
  )

  const focusFileTab = useCallback(
    (tabId: string) => {
      paneManager.focusTab(tabId)
      syncFileSelection(tabId)
    },
    [paneManager, syncFileSelection]
  )

  useEffect(() => {
    openFileTabRef.current = paneManager.openFileTab
    focusFileTabRef.current = focusFileTab
    getAllTabsRef.current = paneManager.getAllTabs
    emitFileWindowsChangeRef.current = emitFileWindowsChange
  }, [paneManager.openFileTab, focusFileTab, paneManager.getAllTabs, emitFileWindowsChange])

  useEffect(() => {
    if (!fileBrowserHostId) return
    const allTabs = getAllTabsRef.current()
    const existingTab = allTabs.find((t) => t.hostId === fileBrowserHostId)
    if (existingTab) {
      focusFileTabRef.current(existingTab.tabId)
    } else {
      const tabId = openFileTabRef.current(fileBrowserHostId, fileBrowserHostAlias)
      openedHostIdsRef.current.add(fileBrowserHostId)
      onActiveFileWindowChange?.(tabId)
      emitFileWindowsChangeRef.current()
    }
  }, [fileBrowserHostId, fileBrowserHostAlias, onActiveFileWindowChange])

  useEffect(() => {
    if (!focusFileRequest) return
    if (lastFocusRequestId.current === focusFileRequest.requestId) return
    lastFocusRequestId.current = focusFileRequest.requestId
    focusFileTab(focusFileRequest.tabId)
  }, [focusFileRequest, focusFileTab])

  useEffect(() => {
    if (!renameFileRequest) return
    if (lastRenameRequestId.current === renameFileRequest.requestId) return
    lastRenameRequestId.current = renameFileRequest.requestId

    const tab = paneManager.getTabData(renameFileRequest.tabId)
    if (!tab) return
    paneManager.registerTab(renameFileRequest.tabId, { ...tab, title: renameFileRequest.title })
    emitFileWindowsChange()
  }, [renameFileRequest, paneManager, emitFileWindowsChange])

  const leaves = paneManager.getLeaves()
  const leafCount = leaves.length
  const focusedLeaf = leaves.find((leaf) => leaf.id === paneManager.focusedLeafId)
  const activeTab =
    (focusedLeaf?.activeTabId ? paneManager.getTabData(focusedLeaf.activeTabId) : undefined) ??
    leaves.flatMap((leaf) =>
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

  const closeFileTabById = useCallback(
    (tabId: string) => {
      const tabData = paneManager.getTabData(tabId)
      const closingActiveTab = activeTab?.tabId === tabId
      paneManager.closeFileTab(tabId)
      if (tabData) {
        openedHostIdsRef.current.delete(tabData.hostId)
      }
      emitFileWindowsChange()

      const remainingTabs = paneManager.getAllTabs()
      if (remainingTabs.length === 0) {
        setFileBrowserHostId(null)
        setFileBrowserHostAlias('')
        onActiveFileWindowChange?.(null)
        setActiveView('hosts')
      } else if (closingActiveTab) {
        focusFileTab(remainingTabs[0].tabId)
      }
    },
    [
      paneManager,
      activeTab,
      emitFileWindowsChange,
      setFileBrowserHostId,
      setFileBrowserHostAlias,
      onActiveFileWindowChange,
      setActiveView,
      focusFileTab
    ]
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeFileTabById(tabId)
    },
    [closeFileTabById]
  )

  useEffect(() => {
    if (!closeFileRequest) return
    if (lastCloseRequestId.current === closeFileRequest.requestId) return
    lastCloseRequestId.current = closeFileRequest.requestId
    closeFileTabById(closeFileRequest.tabId)
  }, [closeFileRequest, closeFileTabById])

  const handleDisconnectAll = useCallback(() => {
    const allTabs = paneManager.getAllTabs()
    for (const tab of allTabs) {
      paneManager.closeFileTab(tab.tabId)
    }
    openedHostIdsRef.current.clear()
    emitFileWindowsChange()
    setFileBrowserHostId(null)
    setFileBrowserHostAlias('')
    onActiveFileWindowChange?.(null)
    setActiveView('hosts')
  }, [
    paneManager,
    emitFileWindowsChange,
    setFileBrowserHostId,
    setFileBrowserHostAlias,
    onActiveFileWindowChange,
    setActiveView
  ])

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handlePaneDragOver = useCallback((e: React.DragEvent, paneId: string) => {
    if (!e.dataTransfer.types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOverEdge(resolvePaneDropEdgeFromPoint(e.clientX, e.clientY, rect))
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
        const placement = edge === 'top' || edge === 'left' ? 'before' : 'after'
        paneManager.splitPaneWithTab(targetPaneId, direction, tabId, placement)
      } else {
        const sourceLeaf = paneManager.findPaneForTab(tabId)
        if (sourceLeaf && sourceLeaf.id !== targetPaneId) {
          paneManager.moveTab(tabId, sourceLeaf.id, targetPaneId)
        }
      }
      syncFileSelection(tabId)
      setDragOverPaneId(null)
      setDragOverEdge(null)
    },
    [dragOverEdge, paneManager, syncFileSelection]
  )

  const handleOpenHost = useCallback(
    (host: Host) => {
      const allTabs = paneManager.getAllTabs()
      const existingTab = allTabs.find((t) => t.hostId === host.id)
      if (existingTab) {
        focusFileTab(existingTab.tabId)
      } else {
        const tabId = paneManager.openFileTab(host.id, host.alias)
        openedHostIdsRef.current.add(host.id)
        setFileBrowserHostId(host.id)
        setFileBrowserHostAlias(host.alias)
        onActiveFileWindowChange?.(tabId)
        emitFileWindowsChange()
      }
      setShowHostPicker(false)
    },
    [
      paneManager,
      focusFileTab,
      setFileBrowserHostId,
      setFileBrowserHostAlias,
      onActiveFileWindowChange,
      emitFileWindowsChange
    ]
  )

  const renderLeaf = useCallback(
    (leaf: PaneLeaf) => {
      const tabs = paneManager.getLeafTabs(leaf)
      const showPaneTitle = tabs.length > 0 && (tabs.length > 1 || leafCount > 1)

      return (
        <div
          className={`relative flex h-full flex-col overflow-hidden bg-white/65 transition-colors ${
            leafCount > 1 ? 'border border-workspace-border/60' : ''
          } ${
            paneManager.focusedLeafId === leaf.id
              ? 'shadow-[inset_0_0_0_1px_rgba(41,120,245,0.24)]'
              : ''
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {showPaneTitle && (
            <div className="flex items-center overflow-x-auto border-b border-workspace-border bg-workspace-muted/70 px-1.5 pt-1 no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.tabId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.tabId)}
                  onClick={() => focusFileTab(tab.tabId)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.tabId
                      ? 'text-workspace-foreground border-accent bg-workspace'
                      : 'text-workspace-muted-foreground border-transparent hover:text-workspace-foreground hover:bg-workspace/70'
                  }`}
                >
                  <Folder size={10} />
                  <span>{tab.title || tab.hostAlias}</span>
                  <ConfirmActionButton
                    aria-label="关闭文件管理标签页"
                    onConfirm={() => handleCloseTab(tab.tabId)}
                    stopPropagation
                    className="ml-1 rounded p-0.5 text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-workspace-foreground"
                    confirmClassName="hover:bg-danger-strong"
                    confirmingTitle="关闭"
                  >
                    <X size={9} />
                  </ConfirmActionButton>
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
              className={`absolute z-20 pointer-events-none border-2 border-accent bg-accent/20 ${paneDropPreviewClass(dragOverEdge)}`}
            />
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden bg-workspace">
            {tabs.map((tab) => (
              <div
                key={tab.tabId}
                className="absolute inset-0"
                style={{ display: leaf.activeTabId === tab.tabId ? 'block' : 'none' }}
              >
                <FileBrowser
                  hostId={tab.hostId}
                  hostAlias={tab.hostAlias}
                  embedded
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
      focusFileTab,
      handleTabDragStart,
      handlePaneDragOver,
      handlePaneDragLeave,
      handlePaneDrop,
      dragOverPaneId,
      dragOverEdge,
      startTransfer,
      leafCount
    ]
  )

  const allTabs = paneManager.getAllTabs()

  return (
    <div className="workspace-canvas relative flex flex-1 flex-col overflow-hidden bg-transparent">
      <div className="workspace-primary-content flex min-h-0 flex-1 flex-col">
        <div className="workspace-layer-header flex flex-col flex-shrink-0 border-b border-workspace-border bg-workspace-muted/70 backdrop-blur-2xl">
          <div className="h-11 text-workspace-foreground px-5 flex items-center justify-between flex-shrink-0 drag">
            <div className="flex items-center gap-3 no-drag">
              <Folder size={13} className="text-accent" />
              <span className="text-xs font-semibold font-mono text-workspace-foreground">
                {activeTab?.title || activeTab?.hostAlias || '文件管理'}
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
              <ConfirmActionButton
                aria-label="关闭全部文件管理"
                onConfirm={handleDisconnectAll}
                className="flex items-center gap-1.5 rounded-md bg-workspace px-3 py-1.5 text-xs font-semibold text-workspace-muted-foreground transition hover:bg-danger/15 hover:text-danger"
                confirmChildren={
                  <>
                    <X size={12} /> 关闭
                  </>
                }
                confirmingTitle="关闭全部"
              >
                <X size={12} /> 关闭全部
              </ConfirmActionButton>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white/45">
          {paneManager.isEmpty ? (
            <div className="flex h-full flex-1 items-center justify-center">
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
                    focusFileTab(tab.tabId)
                    setShowFileList(false)
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/70 bg-white/60 p-3 transition hover:border-accent/25 hover:bg-accent-soft/45"
                >
                  <Folder size={16} className="text-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-semibold text-workspace-foreground">
                      {tab.title || tab.hostAlias}
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
            {selectableHosts.length === 0 ? (
              <p className="text-workspace-muted-foreground text-xs">暂无可用主机</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                {selectableHosts.map((host) => {
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

      <FileTransferToast transfers={transfers} onRemove={removeTransfer} />
    </div>
  )
}
