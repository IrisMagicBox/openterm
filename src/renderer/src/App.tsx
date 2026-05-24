import {
  type JSX,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { PanelLeft } from 'lucide-react'
import { SettingsPage } from './features/settings'
import { ChatPanel, ChatEmptyState } from './features/chat'
import { AddHostModal, HostsView } from './features/hosts'
import { ManageHostsModal } from './components/topics/ManageHostsModal'
import { AuthModal } from './components/AuthModal'
import { AppSidebar } from './components/AppSidebar'
import { TerminalLayout, CommandHistorySearch } from './features/terminal'
import { FilesView } from './features/files'
import { DebugPanel } from './components/DebugPanel'
import { TooltipProvider } from './components/ui'
import { useDebug } from './hooks/useDebug'
import { useHosts } from './hooks/useHosts'
import { useTopics } from './hooks/useTopics'
import { useAgentSessions } from './hooks/useAgentSessions'
import { useTerminalManager } from './hooks/useTerminalManager'
import {
  shouldMirrorSessionInTerminalTabs,
  terminalTabFromSession,
  upsertTerminalTab
} from './lib/terminal-tabs'
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_EXPANDED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_COMPACT_THRESHOLD,
  SIDEBAR_COLLAPSE_THRESHOLD,
  clampSidebarWidth
} from './lib/sidebar-layout'
import { View, WorkspaceWindowItem } from './types'
import type { Host, Topic } from '../../shared/types'
import { WORKSPACE_TERMINALS_TOPIC_ID } from '../../shared/constants'

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-terminal-view]')) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export default function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('hosts')
  const [fileWindows, setFileWindows] = useState<WorkspaceWindowItem[]>([])
  const [activeFileWindowId, setActiveFileWindowId] = useState<string | null>(null)
  const [terminalFocusRequest, setTerminalFocusRequest] = useState<{
    sessionId: string
    requestId: number
  } | null>(null)
  const [terminalCloseRequest, setTerminalCloseRequest] = useState<{
    sessionId: string
    requestId: number
  } | null>(null)
  const [fileFocusRequest, setFileFocusRequest] = useState<{
    tabId: string
    requestId: number
  } | null>(null)
  const [fileCloseRequest, setFileCloseRequest] = useState<{
    tabId: string
    requestId: number
  } | null>(null)
  const [fileRenameRequest, setFileRenameRequest] = useState<{
    tabId: string
    title: string
    requestId: number
  } | null>(null)

  const { debugLogs, showDebug, setShowDebug, clearDebugLogs } = useDebug()

  const {
    hosts,
    selectedHost,
    setSelectedHost,
    showAddHost,
    setShowAddHost,
    searchQuery,
    setSearchQuery,
    loadHosts,
    handleCreateHost,
    handleUpdateHost,
    handleDeleteHost,
    filteredHosts
  } = useHosts()
  const [editingHost, setEditingHost] = useState<Host | null>(null)

  const {
    topics,
    setTopics,
    selectedTopic,
    setSelectedTopic,
    editingTopicId,
    setEditingTopicId,
    editingTopicTitle,
    setEditingTopicTitle,
    showManageHosts,
    setShowManageHosts,
    prefilledText,
    setPrefilledText,
    loadTopics,
    handleCreateTopic: createTopic,
    handleStartRenameTopic,
    handleCommitRenameTopic,
    handleDeleteTopic,
    handleAddHostToTopic,
    handleRemoveHostFromTopic,
    handleUpdateTopicModel
  } = useTopics({ loadHosts })

  const {
    agentSessions,
    thinkingTopics,
    pendingAuth,
    handleCreateTerminal,
    handleCloseTerminal,
    handleRenameTerminal,
    handleToggleTerminalPin,
    handleResolveAuth
  } = useAgentSessions({ selectedTopic })

  const {
    terminalTabs,
    setTerminalTabs,
    activeTerminalTabIndex,
    setActiveTerminalTabIndex,
    terminalSessionId,
    setTerminalSessionId,
    terminalFontSize,
    terminalWidth,
    setTerminalWidth,
    commandHistoryOpen,
    setCommandHistoryOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    fileBrowserHostId,
    setFileBrowserHostId,
    fileBrowserHostAlias,
    setFileBrowserHostAlias
  } = useTerminalManager()

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const appShellRef = useRef<HTMLDivElement>(null)
  const sidebarWidthRef = useRef(sidebarWidth)
  const lastExpandedSidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH)
  const stopSidebarResizeRef = useRef<(() => void) | null>(null)
  const compactSidebar = sidebarCollapsed
  const showComposerAuth = activeView === 'chat' && !!selectedTopic

  const setSidebarCssWidth = useCallback((width: number): void => {
    appShellRef.current?.style.setProperty('--sidebar-width', `${Math.round(width)}px`)
  }, [])

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
    if (sidebarWidth > SIDEBAR_COMPACT_THRESHOLD) {
      lastExpandedSidebarWidthRef.current = sidebarWidth
    }
    setSidebarCssWidth(sidebarWidth)
  }, [setSidebarCssWidth, sidebarWidth])

  useEffect(() => {
    setSidebarWidth((currentWidth) => {
      if (currentWidth <= SIDEBAR_COMPACT_THRESHOLD) {
        sidebarWidthRef.current = SIDEBAR_DEFAULT_WIDTH
        return SIDEBAR_DEFAULT_WIDTH
      }
      return currentWidth
    })
  }, [sidebarCollapsed])

  useEffect(() => {
    return () => {
      stopSidebarResizeRef.current?.()
    }
  }, [])

  const settleSidebarWidth = useCallback(
    (width: number): void => {
      const clampedWidth = clampSidebarWidth(width)
      const shouldCollapse = clampedWidth < SIDEBAR_COLLAPSE_THRESHOLD
      const settledWidth = shouldCollapse
        ? Math.max(lastExpandedSidebarWidthRef.current, SIDEBAR_MIN_EXPANDED_WIDTH)
        : Math.max(clampedWidth, SIDEBAR_MIN_EXPANDED_WIDTH)

      if (!shouldCollapse) {
        lastExpandedSidebarWidthRef.current = settledWidth
      }
      sidebarWidthRef.current = settledWidth
      setSidebarCssWidth(settledWidth)
      setSidebarWidth(settledWidth)
      setSidebarCollapsed(shouldCollapse)
    },
    [setSidebarCollapsed, setSidebarCssWidth]
  )

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      stopSidebarResizeRef.current?.()

      const startWidth = sidebarWidthRef.current
      const startX = event.clientX
      let pendingWidth = startWidth
      let resizeFrame = 0

      setIsResizingSidebar(true)
      document.body.dataset.sidebarResizing = 'true'
      window.dispatchEvent(new Event('openterm:sidebar-resize-start'))

      const applyPendingWidth = (): void => {
        resizeFrame = 0
        setSidebarCssWidth(pendingWidth)
      }

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        moveEvent.preventDefault()
        const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX)
        pendingWidth = nextWidth
        sidebarWidthRef.current = nextWidth
        if (!resizeFrame) {
          resizeFrame = window.requestAnimationFrame(applyPendingWidth)
        }
      }

      function cleanup(): void {
        if (resizeFrame) {
          window.cancelAnimationFrame(resizeFrame)
          resizeFrame = 0
        }
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', finishSidebarResize)
        window.removeEventListener('pointercancel', cancelSidebarResize)
        delete document.body.dataset.sidebarResizing
        setIsResizingSidebar(false)
        stopSidebarResizeRef.current = null
      }

      function finishSidebarResize(): void {
        const finalWidth = sidebarWidthRef.current
        cleanup()
        settleSidebarWidth(finalWidth)
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event('openterm:sidebar-resize-end'))
        })
      }

      function cancelSidebarResize(): void {
        const finalWidth = sidebarWidthRef.current
        cleanup()
        settleSidebarWidth(finalWidth)
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event('openterm:sidebar-resize-end'))
        })
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finishSidebarResize, { once: true })
      window.addEventListener('pointercancel', cancelSidebarResize, { once: true })
      stopSidebarResizeRef.current = cleanup
    },
    [setSidebarCssWidth, settleSidebarWidth]
  )

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      let nextWidth: number | null = null
      const step = event.shiftKey ? 48 : 24

      if (event.key === 'ArrowLeft') {
        nextWidth = compactSidebar ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidthRef.current - step
      } else if (event.key === 'ArrowRight') {
        nextWidth = compactSidebar ? SIDEBAR_MIN_EXPANDED_WIDTH : sidebarWidthRef.current + step
      } else if (event.key === 'Home') {
        nextWidth = SIDEBAR_COLLAPSED_WIDTH
      } else if (event.key === 'End') {
        nextWidth = SIDEBAR_DEFAULT_WIDTH
      } else if (event.key === 'Enter' || event.key === ' ') {
        nextWidth = compactSidebar ? SIDEBAR_DEFAULT_WIDTH : SIDEBAR_COLLAPSED_WIDTH
      }

      if (nextWidth === null) return
      event.preventDefault()
      event.stopPropagation()
      settleSidebarWidth(nextWidth)
    },
    [compactSidebar, settleSidebarWidth]
  )

  const handleToggleSidebar = useCallback((): void => {
    settleSidebarWidth(
      sidebarCollapsed ? lastExpandedSidebarWidthRef.current : SIDEBAR_COLLAPSED_WIDTH
    )
  }, [settleSidebarWidth, sidebarCollapsed])

  useEffect(() => {
    const handleChromePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      if (event.target instanceof Element && event.target.closest('.sidebar-reveal-button')) {
        return
      }

      const inSidebarToggleHitbox =
        event.clientX >= 84 && event.clientX <= 138 && event.clientY >= 0 && event.clientY <= 48

      if (!inSidebarToggleHitbox) return
      event.preventDefault()
      event.stopPropagation()
      handleToggleSidebar()
    }

    window.addEventListener('pointerdown', handleChromePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handleChromePointerDown, { capture: true })
    }
  }, [handleToggleSidebar])

  useEffect(() => {
    loadHosts()
    loadTopics()
  }, [loadHosts, loadTopics])

  const syncWorkspaceTerminalSessions = useCallback(async (): Promise<void> => {
    const sessions = await window.api.getAgentSessions(WORKSPACE_TERMINALS_TOPIC_ID)
    const workspaceSessions = sessions.filter(shouldMirrorSessionInTerminalTabs)
    if (workspaceSessions.length === 0) return

    setTerminalTabs((prev) => {
      let next = prev
      for (const session of workspaceSessions) {
        next = upsertTerminalTab(next, terminalTabFromSession(session, hosts))
      }
      return next
    })

    setTerminalSessionId((prev) => prev ?? workspaceSessions[0]?.id ?? null)
    const firstSession = workspaceSessions[0]
    if (firstSession) {
      setSelectedHost(terminalTabFromSession(firstSession, hosts).host)
    }
  }, [hosts, setSelectedHost, setTerminalSessionId, setTerminalTabs])

  useEffect(() => {
    let cancelled = false
    const sync = (): void => {
      void syncWorkspaceTerminalSessions().catch((error) => {
        if (!cancelled) console.error('Failed to sync workspace terminals:', error)
      })
    }

    sync()
    const unlistenRecovered = window.api.onSessionRecovered(sync)

    return () => {
      cancelled = true
      unlistenRecovered()
    }
  }, [syncWorkspaceTerminalSessions])

  useEffect(() => {
    const unlistenCreated = window.api.onAgentSessionCreated((session) => {
      if (!shouldMirrorSessionInTerminalTabs(session)) return

      const tab = terminalTabFromSession(session, hosts)
      setSelectedHost(tab.host)
      setTerminalSessionId(session.id)
      setTerminalTabs((prev) => {
        const next = upsertTerminalTab(prev, tab)
        const tabIndex = next.findIndex((item) => item.sessionId === session.id)
        setActiveTerminalTabIndex(tabIndex >= 0 ? tabIndex : 0)
        return next
      })
    })

    const unlistenClosed = window.api.onAgentSessionClosed(({ id }) => {
      setTerminalTabs((prev) => {
        const next = prev.filter((tab) => tab.sessionId !== id)
        if (next.length !== prev.length) {
          setActiveTerminalTabIndex((index) =>
            next.length === 0 ? 0 : Math.min(index, next.length - 1)
          )
        }
        return next
      })
      setTerminalSessionId((prev) => (prev === id ? null : prev))
    })

    return () => {
      unlistenCreated()
      unlistenClosed()
    }
  }, [hosts, setActiveTerminalTabIndex, setSelectedHost, setTerminalSessionId, setTerminalTabs])

  useEffect(() => {
    const handleCommandHistoryKey = (event: KeyboardEvent): void => {
      if (activeView !== 'terminal' || !terminalSessionId) return
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'r') {
        return
      }
      if (isEditableKeyboardTarget(event.target)) return

      event.preventDefault()
      setCommandHistoryOpen(true)
    }

    window.addEventListener('keydown', handleCommandHistoryKey)
    return () => window.removeEventListener('keydown', handleCommandHistoryKey)
  }, [activeView, setCommandHistoryOpen, terminalSessionId])

  const terminalWindows = useMemo<WorkspaceWindowItem[]>(
    () =>
      terminalTabs.map(({ host, sessionId, title }) => ({
        id: sessionId,
        title: title || host.alias,
        subtitle:
          host.id === 'local'
            ? '本机'
            : `${host.username}@${host.ip}${host.port && host.port !== 22 ? `:${host.port}` : ''}`
      })),
    [terminalTabs]
  )
  const activeTerminalTab = useMemo(
    () =>
      terminalTabs.find((tab) => tab.sessionId === terminalSessionId) ??
      terminalTabs[activeTerminalTabIndex] ??
      null,
    [activeTerminalTabIndex, terminalSessionId, terminalTabs]
  )

  const handleCreateLocalAgentTopic = async (): Promise<Topic> => {
    try {
      const topic = await createTopic(undefined, ['local'])
      setActiveView('chat')
      setPrefilledText('@本机 ')
      return topic
    } catch (err) {
      console.error('Failed to create local agent topic:', err)
      throw err
    }
  }

  const handleCreateTopic = async (initialText?: string): Promise<void> => {
    await createTopic(initialText)
    setActiveView('chat')
  }

  return (
    <TooltipProvider>
      <div
        ref={appShellRef}
        className="app-shell relative flex h-screen w-screen overflow-hidden text-foreground select-none"
        data-sidebar-collapsed={compactSidebar ? 'true' : 'false'}
        style={
          {
            '--sidebar-width': `${Math.round(sidebarWidth)}px`,
            '--workspace-overlap': compactSidebar ? `${Math.round(sidebarWidth)}px` : '14px'
          } as CSSProperties
        }
      >
        <button
          type="button"
          aria-label={compactSidebar ? '显示侧边栏' : '隐藏侧边栏'}
          title={compactSidebar ? '显示侧边栏' : '隐藏侧边栏'}
          onPointerDownCapture={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            handleToggleSidebar()
          }}
          onMouseDownCapture={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          className="sidebar-reveal-button"
        >
          <span className="sidebar-reveal-button-surface">
            <PanelLeft size={16} />
          </span>
        </button>

        <AppSidebar
          compactSidebar={false}
          isResizingSidebar={isResizingSidebar}
          activeView={activeView}
          setActiveView={setActiveView}
          hosts={hosts}
          topics={topics}
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          editingTopicId={editingTopicId}
          setEditingTopicId={setEditingTopicId}
          editingTopicTitle={editingTopicTitle}
          setEditingTopicTitle={setEditingTopicTitle}
          onCreateTopic={() => handleCreateTopic()}
          onStartRenameTopic={handleStartRenameTopic}
          onCommitRenameTopic={handleCommitRenameTopic}
          onDeleteTopic={handleDeleteTopic}
          setPrefilledText={setPrefilledText}
          terminalWindows={terminalWindows}
          fileWindows={fileWindows}
          activeTerminalId={terminalSessionId}
          activeFileWindowId={activeFileWindowId}
          onSelectTerminalWindow={(id) => {
            setActiveView('terminal')
            setTerminalSessionId(id)
            setTerminalFocusRequest({ sessionId: id, requestId: Date.now() })
          }}
          onSelectFileWindow={(id) => {
            setActiveView('files')
            setActiveFileWindowId(id)
            setFileFocusRequest({ tabId: id, requestId: Date.now() })
          }}
          onRenameTerminalWindow={(id, title) => {
            setTerminalTabs((prev) =>
              prev.map((tab) => (tab.sessionId === id ? { ...tab, title } : tab))
            )
          }}
          onRenameFileWindow={(id, title) => {
            setFileRenameRequest({ tabId: id, title, requestId: Date.now() })
          }}
          onDeleteTerminalWindow={(id) => {
            setTerminalCloseRequest({ sessionId: id, requestId: Date.now() })
          }}
          onDeleteFileWindow={(id) => {
            setFileCloseRequest({ tabId: id, requestId: Date.now() })
          }}
        />

        <main className="app-workspace-frame relative z-20 flex flex-1 flex-col">
          <div className={activeView === 'hosts' ? 'flex-1 flex flex-col' : 'hidden'}>
            <HostsView
              filteredHosts={filteredHosts}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setShowAddHost={setShowAddHost}
              setSelectedHost={setSelectedHost}
              setTerminalSessionId={setTerminalSessionId}
              setTerminalTabs={setTerminalTabs}
              setActiveTerminalTabIndex={setActiveTerminalTabIndex}
              setActiveView={setActiveView}
              topics={topics}
              setTopics={setTopics}
              setSelectedTopic={setSelectedTopic}
              setPrefilledText={setPrefilledText}
              setFileBrowserHostId={setFileBrowserHostId}
              setFileBrowserHostAlias={setFileBrowserHostAlias}
              handleDeleteHost={handleDeleteHost}
              onEditHost={(host) => {
                setEditingHost(host)
                setShowAddHost(true)
              }}
              onCreateLocalAgentTopic={handleCreateLocalAgentTopic}
            />
          </div>

          <div className={activeView === 'terminal' ? 'flex-1 flex flex-col' : 'hidden'}>
            <TerminalLayout
              terminalTabs={terminalTabs}
              setTerminalTabs={setTerminalTabs}
              activeTerminalTabIndex={activeTerminalTabIndex}
              setActiveTerminalTabIndex={setActiveTerminalTabIndex}
              selectedHost={selectedHost}
              setSelectedHost={setSelectedHost}
              terminalSessionId={terminalSessionId}
              setTerminalSessionId={setTerminalSessionId}
              terminalFontSize={terminalFontSize}
              setActiveView={setActiveView}
              fileBrowserHostId={fileBrowserHostId}
              setFileBrowserHostId={setFileBrowserHostId}
              fileBrowserHostAlias={fileBrowserHostAlias}
              setFileBrowserHostAlias={setFileBrowserHostAlias}
              active={activeView === 'terminal'}
              focusTerminalRequest={terminalFocusRequest}
              closeTerminalRequest={terminalCloseRequest}
            />
          </div>

          <div className={activeView === 'files' ? 'flex-1 flex flex-col' : 'hidden'}>
            <FilesView
              fileBrowserHostId={fileBrowserHostId || ''}
              fileBrowserHostAlias={fileBrowserHostAlias}
              setFileBrowserHostId={setFileBrowserHostId}
              setFileBrowserHostAlias={setFileBrowserHostAlias}
              setActiveView={setActiveView}
              hosts={hosts}
              focusFileRequest={fileFocusRequest}
              closeFileRequest={fileCloseRequest}
              renameFileRequest={fileRenameRequest}
              onFileWindowsChange={setFileWindows}
              onActiveFileWindowChange={setActiveFileWindowId}
            />
          </div>

          {activeView === 'chat' && selectedTopic && (
            <ChatPanel
              key={selectedTopic.id}
              topic={selectedTopic}
              hosts={hosts}
              prefill={prefilledText}
              thinking={thinkingTopics.has(selectedTopic.id)}
              onManageHosts={() => setShowManageHosts(true)}
              agentSessions={agentSessions}
              terminalWidth={terminalWidth}
              setTerminalWidth={setTerminalWidth}
              terminalFontSize={terminalFontSize}
              onRemoveHostFromTopic={handleRemoveHostFromTopic}
              onOpenFileBrowser={(host) => {
                setFileBrowserHostId(host.id)
                setFileBrowserHostAlias(host.alias)
                setActiveView('files')
              }}
              onCreateTerminal={handleCreateTerminal}
              onCloseTerminal={handleCloseTerminal}
              onRenameTerminal={handleRenameTerminal}
              onToggleTerminalPin={handleToggleTerminalPin}
              onUpdateModel={handleUpdateTopicModel}
              pendingAuth={pendingAuth}
              onResolveAuth={handleResolveAuth}
            />
          )}

          {activeView === 'chat' && !selectedTopic && (
            <ChatEmptyState onCreateTopic={() => handleCreateTopic()} />
          )}

          {activeView === 'settings' && <SettingsPage />}
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          aria-valuemin={SIDEBAR_COLLAPSED_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          data-resizing={isResizingSidebar ? 'true' : 'false'}
          className="sidebar-resize-rail no-drag"
          onPointerDown={startSidebarResize}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            settleSidebarWidth(compactSidebar ? SIDEBAR_DEFAULT_WIDTH : SIDEBAR_COLLAPSED_WIDTH)
          }}
          onKeyDown={handleSidebarResizeKeyDown}
        />

        {showAddHost && (
          <AddHostModal
            host={editingHost ?? undefined}
            onClose={() => {
              setShowAddHost(false)
              setEditingHost(null)
            }}
            onSave={handleCreateHost}
            onUpdate={handleUpdateHost}
          />
        )}
        {pendingAuth && !showComposerAuth && (
          <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[220] px-6">
            <div className="pointer-events-auto mx-auto w-full max-w-[860px]">
              <AuthModal
                requestId={pendingAuth.requestId}
                command={pendingAuth.command}
                riskLevel={pendingAuth.riskLevel}
                reason={pendingAuth.reason}
                metadata={pendingAuth.metadata}
                onResolve={handleResolveAuth}
              />
            </div>
          </div>
        )}
        {showManageHosts && selectedTopic && (
          <ManageHostsModal
            topic={selectedTopic}
            allHosts={hosts}
            onClose={() => setShowManageHosts(false)}
            onAddHost={handleAddHostToTopic}
            onRemoveHost={handleRemoveHostFromTopic}
          />
        )}

        {commandHistoryOpen && (
          <CommandHistorySearch
            onSelect={(cmd) => {
              if (activeView === 'terminal' && terminalSessionId) {
                const targetHost = activeTerminalTab?.host ?? selectedHost
                if (targetHost?.id === 'local') {
                  window.api.sendLocalInput(terminalSessionId, cmd + '\n')
                } else {
                  window.api.sendSSHInput(terminalSessionId, cmd + '\n')
                }
              }
            }}
            onClose={() => setCommandHistoryOpen(false)}
          />
        )}

        <DebugPanel
          showDebug={showDebug}
          setShowDebug={setShowDebug}
          debugLogs={debugLogs}
          clearDebugLogs={clearDebugLogs}
        />
      </div>
    </TooltipProvider>
  )
}
