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
import {
  paneDropPreviewClass,
  resolvePaneDropEdgeFromPoint,
  type PaneDropEdge
} from '../../lib/pane-drop'

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
  focusTerminalRequest?: { sessionId: string; requestId: number } | null
  closeTerminalRequest?: { sessionId: string; requestId: number } | null
}

export function TerminalLayout({
  terminalTabs: legacyTabs,
  setTerminalTabs: setLegacyTabs,
  setActiveTerminalTabIndex,
  selectedHost,
  setSelectedHost,
  terminalSessionId,
  setTerminalSessionId,
  terminalFontSize,
  setTerminalFontSize,
  setActiveView,
  fileBrowserHostId,
  setFileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostAlias,
  focusTerminalRequest,
  closeTerminalRequest
}: TerminalLayoutProps): React.ReactElement {
  const paneManager = useTerminalPaneManager()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showTerminalList, setShowTerminalList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<PaneDropEdge | null>(null)

  const syncedSessionIds = useRef<Set<string>>(new Set())
  const openTerminalRef = useRef(paneManager.openTerminal)
  const registerTerminalRef = useRef(paneManager.registerTab)
  const closeTerminalRef = useRef(paneManager.closeTerminalTab)
  const lastFocusRequestId = useRef<number | null>(null)
  const lastCloseRequestId = useRef<number | null>(null)

  useEffect(() => {
    openTerminalRef.current = paneManager.openTerminal
    registerTerminalRef.current = paneManager.registerTab
    closeTerminalRef.current = paneManager.closeTerminalTab
  }, [paneManager.openTerminal, paneManager.registerTab, paneManager.closeTerminalTab])

  useEffect(() => {
    const nextSessionIds = new Set(legacyTabs.map((tab) => tab.sessionId))
    for (const sessionId of Array.from(syncedSessionIds.current)) {
      if (!nextSessionIds.has(sessionId)) {
        syncedSessionIds.current.delete(sessionId)
        closeTerminalRef.current(sessionId)
      }
    }

    for (const tab of legacyTabs) {
      if (!syncedSessionIds.current.has(tab.sessionId)) {
        syncedSessionIds.current.add(tab.sessionId)
        openTerminalRef.current(tab.host, tab.sessionId)
      } else {
        registerTerminalRef.current(tab.sessionId, tab)
      }
    }
  }, [legacyTabs])

  const syncTerminalSelection = useCallback(
    (sessionId: string) => {
      const tab = paneManager.getTabData(sessionId)
      if (!tab) return

      setTerminalSessionId(sessionId)
      setSelectedHost(tab.host)

      const tabIndex = legacyTabs.findIndex((legacyTab) => legacyTab.sessionId === sessionId)
      if (tabIndex >= 0) {
        setActiveTerminalTabIndex(tabIndex)
      }
    },
    [paneManager, setTerminalSessionId, setSelectedHost, legacyTabs, setActiveTerminalTabIndex]
  )

  const focusTerminalTab = useCallback(
    (sessionId: string) => {
      paneManager.focusTab(sessionId)
      syncTerminalSelection(sessionId)
    },
    [paneManager, syncTerminalSelection]
  )

  useEffect(() => {
    if (!focusTerminalRequest) return
    if (lastFocusRequestId.current === focusTerminalRequest.requestId) return
    lastFocusRequestId.current = focusTerminalRequest.requestId
    focusTerminalTab(focusTerminalRequest.sessionId)
  }, [focusTerminalRequest, focusTerminalTab])

  const leaves = paneManager.getLeaves()
  const leafCount = leaves.length
  const focusedLeaf = leaves.find((leaf) => leaf.id === paneManager.focusedLeafId)
  const activeTab = (() => {
    const tab =
      (focusedLeaf?.activeTabId ? paneManager.getTabData(focusedLeaf.activeTabId) : undefined) ??
      leaves.flatMap((leaf) =>
        leaf.activeTabId ? [paneManager.getTabData(leaf.activeTabId)].filter(Boolean) : []
      )[0]

    if (!tab) return undefined
    return legacyTabs.find((legacyTab) => legacyTab.sessionId === tab.sessionId) ?? tab
  })()

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

  const closeTerminalTab = useCallback(
    (tabId: string) => {
      paneManager.closeTerminalTab(tabId)
      syncedSessionIds.current.delete(tabId)
      setLegacyTabs((prev) => prev.filter((tab) => tab.sessionId !== tabId))

      const remainingTabs = paneManager.getAllTabs()
      if (remainingTabs.length === 0) {
        setLegacyTabs([])
        setActiveView('hosts')
        setSelectedHost(null)
        setTerminalSessionId(null)
      } else if (terminalSessionId === tabId) {
        focusTerminalTab(remainingTabs[0].sessionId)
      }
    },
    [
      paneManager,
      setLegacyTabs,
      setActiveView,
      setSelectedHost,
      setTerminalSessionId,
      terminalSessionId,
      focusTerminalTab
    ]
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
      closeTerminalTab(tabId)
    },
    [confirm, closeTerminalTab]
  )

  useEffect(() => {
    if (!closeTerminalRequest) return
    if (lastCloseRequestId.current === closeTerminalRequest.requestId) return
    lastCloseRequestId.current = closeTerminalRequest.requestId
    closeTerminalTab(closeTerminalRequest.sessionId)
  }, [closeTerminalRequest, closeTerminalTab])

  const handleDisconnectAll = useCallback(async () => {
    const ok = await confirm({
      title: '断开全部',
      message: '确定断开所有终端连接？',
      confirmText: '断开',
      variant: 'danger'
    })
    if (!ok) return
    for (const tab of paneManager.getAllTabs()) {
      paneManager.closeTerminalTab(tab.sessionId)
      syncedSessionIds.current.delete(tab.sessionId)
    }
    setLegacyTabs([])
    setActiveView('hosts')
    setSelectedHost(null)
    setTerminalSessionId(null)
  }, [confirm, paneManager, setLegacyTabs, setActiveView, setSelectedHost, setTerminalSessionId])

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
      syncTerminalSelection(tabId)
      setDragOverPaneId(null)
      setDragOverEdge(null)
    },
    [dragOverEdge, paneManager, syncTerminalSelection]
  )

  const renderLeaf = useCallback(
    (leaf: PaneLeaf) => {
      const tabs = paneManager
        .getLeafTabs(leaf)
        .map((tab) => legacyTabs.find((legacyTab) => legacyTab.sessionId === tab.sessionId) ?? tab)
      const showPaneTitle = tabs.length > 0 && (tabs.length > 1 || leafCount > 1)

      return (
        <div
          className={`relative flex h-full flex-col overflow-hidden rounded-xl border bg-workspace shadow-sm transition-colors ${
            paneManager.focusedLeafId === leaf.id
              ? 'border-accent/35 ring-2 ring-accent/15'
              : 'border-workspace-border/75'
          }`}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {showPaneTitle && (
            <div className="flex items-center overflow-x-auto border-b border-workspace-border bg-workspace-muted/90 px-1.5 pt-1 no-scrollbar">
              {tabs.map((tab) => (
                <div
                  key={tab.sessionId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.sessionId)}
                  onClick={() => focusTerminalTab(tab.sessionId)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-bold cursor-grab transition-colors border-b-2 whitespace-nowrap ${
                    leaf.activeTabId === tab.sessionId
                      ? 'text-workspace-foreground border-accent bg-workspace'
                      : 'text-workspace-muted-foreground border-transparent hover:text-workspace-foreground hover:bg-workspace/70'
                  }`}
                >
                  <TerminalIcon size={10} />
                  <span>{tab.title || tab.host.alias}</span>
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
              className={`absolute z-20 pointer-events-none border-2 border-accent bg-accent/20 ${paneDropPreviewClass(dragOverEdge)}`}
            />
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
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
                  onFocusSession={() => focusTerminalTab(tab.sessionId)}
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
      focusTerminalTab,
      handleTabDragStart,
      handlePaneDragOver,
      handlePaneDragLeave,
      handlePaneDrop,
      dragOverPaneId,
      dragOverEdge,
      startTransfer,
      leafCount,
      legacyTabs
    ]
  )

  const allTabs = paneManager
    .getAllTabs()
    .map((tab) => legacyTabs.find((legacyTab) => legacyTab.sessionId === tab.sessionId) ?? tab)

  return (
    <div className="relative flex flex-1 gap-3 overflow-hidden bg-workspace-muted/45 p-3">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-workspace-border/75 bg-workspace shadow-sm">
        <div className="flex flex-col flex-shrink-0 border-b border-workspace-border bg-workspace-muted/85 backdrop-blur-2xl">
          <div className="h-11 px-5 flex items-center justify-between flex-shrink-0 drag text-workspace-foreground">
            <div className="flex items-center gap-3 no-drag">
              <TerminalIcon size={13} className="text-accent" />
              <span className="font-mono text-xs font-semibold text-workspace-foreground">
                {activeTab?.title || activeTab?.host.alias || selectedHost?.alias}
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
              <div className="mr-1 flex overflow-hidden rounded-lg border border-workspace-border bg-workspace/80 shadow-sm">
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

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-workspace-muted/35 p-3">
          {paneManager.isEmpty ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-workspace-border/80 bg-workspace">
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
            className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/10 backdrop-blur-lg"
            onClick={() => setShowTerminalList(false)}
          >
            <div
              className="glass-menu mx-4 w-full max-w-2xl rounded-2xl p-5"
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
                      focusTerminalTab(tab.sessionId)
                      setShowTerminalList(false)
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/70 bg-white/60 p-3 transition hover:border-accent/25 hover:bg-accent-soft/45"
                  >
                    <TerminalIcon size={16} className="text-accent" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-semibold text-workspace-foreground">
                        {tab.title || tab.host.alias}
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
        <div className="w-96 flex-shrink-0 overflow-hidden rounded-2xl border border-workspace-border/75 bg-workspace shadow-sm">
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
