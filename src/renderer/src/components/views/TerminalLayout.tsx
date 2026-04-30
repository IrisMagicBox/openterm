import { useState, useCallback, useRef, useEffect } from 'react'
import { Terminal as TerminalIcon, X, Folder, LayoutGrid, Columns, Rows } from 'lucide-react'
import { TerminalView } from '../TerminalView'
import { FileBrowser } from '../terminal/FileBrowser'
import { Host } from '../../../../shared/types'
import { View } from '../../types'
import { SplitPane } from '../SplitPane'
import { PaneLeaf } from '../../types/pane'
import { useTerminalPaneManager, TerminalTab } from '../../hooks/useTerminalPaneManager'
import { useFileTransfer } from '../../hooks/useFileTransfer'
import { FileTransferToast } from '../FileTransferToast'
import { ConfirmActionButton } from '../ui'
import { cn } from '../../lib/utils'
import {
  paneDropPreviewClass,
  resolvePaneDropEdgeFromPoint,
  type PaneDropEdge
} from '../../lib/pane-drop'
import { WORKSPACE_TERMINALS_TOPIC_ID } from '../../../../shared/constants'

const FILE_PANEL_WIDTH_STORAGE_KEY = 'openterm.terminalFilePanel.width'
const DEFAULT_FILE_PANEL_WIDTH = 384
const MIN_FILE_PANEL_WIDTH = 280
const MAX_FILE_PANEL_WIDTH = 560
const MIN_TERMINAL_WORKSPACE_WIDTH = 420

function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.max(minWidth, Math.min(maxWidth, width))
}

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
  setActiveView,
  fileBrowserHostId,
  setFileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostAlias,
  focusTerminalRequest,
  closeTerminalRequest
}: TerminalLayoutProps): React.ReactElement {
  const paneManager = useTerminalPaneManager()
  const { transfers, startTransfer, removeTransfer } = useFileTransfer()
  const [showTerminalList, setShowTerminalList] = useState(false)
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null)
  const [dragOverEdge, setDragOverEdge] = useState<PaneDropEdge | null>(null)
  const [filePanelWidth, setFilePanelWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(FILE_PANEL_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
      ? clampPanelWidth(stored, MIN_FILE_PANEL_WIDTH, MAX_FILE_PANEL_WIDTH)
      : DEFAULT_FILE_PANEL_WIDTH
  })
  const [filePanelResizeRightEdge, setFilePanelResizeRightEdge] = useState<number | null>(null)

  const layoutRef = useRef<HTMLDivElement>(null)
  const syncedSessionIds = useRef<Set<string>>(new Set())
  const openTerminalRef = useRef(paneManager.openTerminal)
  const registerTerminalRef = useRef(paneManager.registerTab)
  const closeTerminalRef = useRef(paneManager.closeTerminalTab)
  const lastFocusRequestId = useRef<number | null>(null)
  const lastCloseRequestId = useRef<number | null>(null)
  const isResizingFilePanel = filePanelResizeRightEdge !== null

  useEffect(() => {
    openTerminalRef.current = paneManager.openTerminal
    registerTerminalRef.current = paneManager.registerTab
    closeTerminalRef.current = paneManager.closeTerminalTab
  }, [paneManager.openTerminal, paneManager.registerTab, paneManager.closeTerminalTab])

  useEffect(() => {
    window.localStorage.setItem(FILE_PANEL_WIDTH_STORAGE_KEY, String(Math.round(filePanelWidth)))
  }, [filePanelWidth])

  useEffect(() => {
    if (!isResizingFilePanel) return undefined
    document.body.dataset.panelResizing = 'true'
    return () => {
      delete document.body.dataset.panelResizing
    }
  }, [isResizingFilePanel])

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

  const removeTerminalTab = useCallback(
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

  const closeTerminalTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      try {
        await window.api.closeAgentTerminal(tabId, 'user')
        removeTerminalTab(tabId)
        return true
      } catch (error) {
        console.error('Failed to close terminal session:', error)
        return false
      }
    },
    [removeTerminalTab]
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      void closeTerminalTab(tabId)
    },
    [closeTerminalTab]
  )

  useEffect(() => {
    if (!closeTerminalRequest) return
    if (lastCloseRequestId.current === closeTerminalRequest.requestId) return
    lastCloseRequestId.current = closeTerminalRequest.requestId
    void closeTerminalTab(closeTerminalRequest.sessionId)
  }, [closeTerminalRequest, closeTerminalTab])

  const handleDisconnectAll = useCallback(async () => {
    const tabs = paneManager.getAllTabs()
    for (const tab of tabs) {
      await closeTerminalTab(tab.sessionId)
    }
  }, [closeTerminalTab, paneManager])

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
          className={cn(
            'relative flex h-full flex-col overflow-hidden bg-white/65 transition-colors',
            leafCount > 1 && 'border border-workspace-border/60',
            paneManager.focusedLeafId === leaf.id &&
              'shadow-[inset_0_0_0_1px_rgba(41,120,245,0.24)]'
          )}
          onMouseDown={() => paneManager.setFocusedLeafId(leaf.id)}
          onDragOver={(e) => handlePaneDragOver(e, leaf.id)}
          onDragLeave={handlePaneDragLeave}
          onDrop={(e) => handlePaneDrop(e, leaf.id)}
        >
          {showPaneTitle && (
            <div className="flex items-center overflow-x-auto border-b border-workspace-border bg-workspace-muted/70 px-1.5 pt-1 no-scrollbar">
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
                  <ConfirmActionButton
                    aria-label="关闭终端标签页"
                    onConfirm={() => handleCloseTab(tab.sessionId)}
                    stopPropagation
                    className="ml-1 rounded p-0.5 text-workspace-muted-foreground transition hover:bg-workspace-border hover:text-workspace-foreground"
                    confirmClassName="hover:bg-danger-strong"
                    confirmingTitle="关闭"
                  >
                    <X size={9} />
                  </ConfirmActionButton>
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
                  topicId={WORKSPACE_TERMINALS_TOPIC_ID}
                  hostId={tab.host.id}
                  hostAlias={tab.host.alias}
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
  const leafToSplit = leaves.find((l) => l.id === paneManager.focusedLeafId) || leaves[0]
  const canSplitFocusedLeaf = !!leafToSplit && leafToSplit.tabIds.length >= 2
  const splitDisabledTitle = '需要至少 2 个标签才能分屏'

  return (
    <div
      ref={layoutRef}
      className="workspace-canvas relative flex flex-1 gap-0 overflow-hidden bg-transparent"
    >
      <div className="workspace-primary-content flex min-w-0 flex-1 flex-col">
        <div className="workspace-layer-header flex flex-col flex-shrink-0 border-b border-workspace-border bg-workspace-muted/70 backdrop-blur-2xl">
          <div className="h-[var(--workspace-header-height)] px-5 flex items-center justify-between flex-shrink-0 drag text-workspace-foreground">
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
            <div className="flex items-center gap-1.5 no-drag">
              {allTabs.length > 0 && (
                <div className="flex gap-1">
                  {leafToSplit && (
                    <>
                      <button
                        onClick={() => handleSplit(leafToSplit.id, 'horizontal')}
                        disabled={!canSplitFocusedLeaf}
                        className={cn(
                          'workspace-top-icon-button text-workspace-muted-foreground',
                          !canSplitFocusedLeaf &&
                            'cursor-not-allowed opacity-45 hover:text-workspace-muted-foreground'
                        )}
                        title={canSplitFocusedLeaf ? '水平分屏' : splitDisabledTitle}
                        aria-label={
                          canSplitFocusedLeaf ? '水平分屏' : `水平分屏：${splitDisabledTitle}`
                        }
                      >
                        <Columns />
                      </button>
                      <button
                        onClick={() => handleSplit(leafToSplit.id, 'vertical')}
                        disabled={!canSplitFocusedLeaf}
                        className={cn(
                          'workspace-top-icon-button text-workspace-muted-foreground',
                          !canSplitFocusedLeaf &&
                            'cursor-not-allowed opacity-45 hover:text-workspace-muted-foreground'
                        )}
                        title={canSplitFocusedLeaf ? '垂直分屏' : splitDisabledTitle}
                        aria-label={
                          canSplitFocusedLeaf ? '垂直分屏' : `垂直分屏：${splitDisabledTitle}`
                        }
                      >
                        <Rows />
                      </button>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowTerminalList(!showTerminalList)}
                className="workspace-top-icon-button text-workspace-muted-foreground"
                title="终端列表"
                aria-label="终端列表"
              >
                <LayoutGrid />
              </button>
              <button
                onClick={() => {
                  if (activeTab?.host || selectedHost) {
                    const h = activeTab?.host || selectedHost!
                    setFileBrowserHostId(h.id)
                    setFileBrowserHostAlias(h.alias)
                  }
                }}
                className="workspace-top-icon-button text-workspace-muted-foreground"
                title="文件管理"
                aria-label="文件管理"
              >
                <Folder />
              </button>
              <ConfirmActionButton
                aria-label="断开全部终端"
                onConfirm={handleDisconnectAll}
                className="workspace-top-icon-button workspace-top-button-danger text-workspace-muted-foreground"
                confirmChildren={<X />}
                confirmingTitle="断开全部"
                title="断开全部"
              >
                <X />
              </ConfirmActionButton>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white/45">
          {paneManager.isEmpty ? (
            <div className="flex flex-1 items-center justify-center">
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
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整文件边栏宽度"
            aria-valuemin={MIN_FILE_PANEL_WIDTH}
            aria-valuemax={MAX_FILE_PANEL_WIDTH}
            aria-valuenow={Math.round(filePanelWidth)}
            tabIndex={0}
            data-resizing={isResizingFilePanel ? 'true' : 'false'}
            className="workspace-resize-handle no-drag"
            onMouseDown={(event) => {
              event.preventDefault()
              const filePanel = event.currentTarget.nextElementSibling as HTMLElement | null
              setFilePanelResizeRightEdge(
                filePanel?.getBoundingClientRect().right ?? window.innerWidth
              )
            }}
            onDoubleClick={(event) => {
              event.preventDefault()
              setFilePanelWidth(DEFAULT_FILE_PANEL_WIDTH)
            }}
          />
          <div
            className="workspace-side-panel side-workspace-layer flex-shrink-0 overflow-hidden"
            style={{ width: filePanelWidth }}
          >
            <FileBrowser
              hostId={fileBrowserHostId}
              hostAlias={fileBrowserHostAlias}
              embedded
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
        </>
      )}

      <FileTransferToast transfers={transfers} onRemove={removeTransfer} />
      {isResizingFilePanel && (
        <div
          className="fixed inset-0 z-[100] cursor-col-resize select-none pointer-events-auto bg-transparent"
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={(event) => {
            const rightEdge = filePanelResizeRightEdge ?? window.innerWidth
            const layoutLeft = layoutRef.current?.getBoundingClientRect().left ?? 0
            const maxWidth = Math.min(
              MAX_FILE_PANEL_WIDTH,
              Math.max(MIN_FILE_PANEL_WIDTH, rightEdge - layoutLeft - MIN_TERMINAL_WORKSPACE_WIDTH)
            )
            setFilePanelWidth(
              clampPanelWidth(rightEdge - event.clientX, MIN_FILE_PANEL_WIDTH, maxWidth)
            )
          }}
          onMouseUp={() => setFilePanelResizeRightEdge(null)}
        />
      )}
    </div>
  )
}
