import { type JSX, useState, useEffect, useMemo } from 'react'
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
import { usePermissions } from './hooks/usePermissions'
import { useDebug } from './hooks/useDebug'
import { useHosts } from './hooks/useHosts'
import { useTopics } from './hooks/useTopics'
import { useAgentSessions } from './hooks/useAgentSessions'
import { useTerminalManager } from './hooks/useTerminalManager'
import { View, WorkspaceWindowItem } from './types'
import type { Topic } from '../../shared/types'

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
    handleDeleteHost,
    filteredHosts
  } = useHosts()

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
    handleToggleAgentTerminalPaused,
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
    setTerminalFontSize,
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

  const { requireConfirmation } = usePermissions()

  useEffect(() => {
    loadHosts()
    loadTopics()
  }, [loadHosts, loadTopics])

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

  const handleCreateLocalAgentTopic = async (): Promise<Topic> => {
    try {
      const topic = await createTopic(undefined, ['local'])
      setActiveView('chat')
      setPrefilledText('本机: ')
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
      <div className="flex h-screen w-screen overflow-hidden bg-surface text-foreground select-none">
        <AppSidebar
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
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
          requireConfirmation={requireConfirmation}
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

        <main className="relative flex flex-1 flex-col overflow-hidden bg-surface">
          <div className={activeView === 'hosts' ? 'flex-1 flex flex-col' : 'hidden'}>
            <HostsView
              filteredHosts={filteredHosts}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setShowAddHost={setShowAddHost}
              selectedTopic={selectedTopic}
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
              setTerminalFontSize={setTerminalFontSize}
              setActiveView={setActiveView}
              fileBrowserHostId={fileBrowserHostId}
              setFileBrowserHostId={setFileBrowserHostId}
              fileBrowserHostAlias={fileBrowserHostAlias}
              setFileBrowserHostAlias={setFileBrowserHostAlias}
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
              onCloseAgentTerminal={handleCloseTerminal}
              onToggleAgentTerminalPaused={handleToggleAgentTerminalPaused}
              terminalWidth={terminalWidth}
              setTerminalWidth={setTerminalWidth}
              terminalFontSize={terminalFontSize}
              setTerminalFontSize={setTerminalFontSize}
              onRemoveHostFromTopic={handleRemoveHostFromTopic}
              onCreateTerminal={handleCreateTerminal}
              onCloseTerminal={handleCloseTerminal}
              onRenameTerminal={handleRenameTerminal}
              onToggleTerminalPin={handleToggleTerminalPin}
              onUpdateModel={handleUpdateTopicModel}
            />
          )}

          {activeView === 'chat' && !selectedTopic && (
            <ChatEmptyState onCreateTopic={() => handleCreateTopic()} />
          )}

          {activeView === 'settings' && <SettingsPage />}
        </main>

        {showAddHost && (
          <AddHostModal onClose={() => setShowAddHost(false)} onSave={handleCreateHost} />
        )}
        {pendingAuth && (
          <AuthModal
            requestId={pendingAuth.requestId}
            command={pendingAuth.command}
            riskLevel={pendingAuth.riskLevel}
            reason={pendingAuth.reason}
            onResolve={handleResolveAuth}
          />
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
                window.api.sendSSHInput(terminalSessionId, cmd + '\n')
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
