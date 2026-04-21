import { type JSX, useState, useEffect } from 'react'
import { SettingsPage } from './features/settings'
import { ChatPanel, ChatEmptyState } from './features/chat'
import { AddHostModal, HostsView } from './features/hosts'
import { ManageHostsModal } from './components/topics/ManageHostsModal'
import { AuthModal } from './components/AuthModal'
import { AppSidebar } from './components/AppSidebar'
import { TerminalLayout, CommandHistorySearch } from './features/terminal'
import { FilesView } from './features/files'
import { DebugPanel } from './components/DebugPanel'
import { usePermissions } from './hooks/usePermissions'
import { useDebug } from './hooks/useDebug'
import { useHosts } from './hooks/useHosts'
import { useTopics } from './hooks/useTopics'
import { useAgentSessions } from './hooks/useAgentSessions'
import { useTerminalManager } from './hooks/useTerminalManager'
import { View } from './types'
import type { Topic } from '../../shared/types'

export default function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('hosts')

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
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 select-none">
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
      />

      <main className="flex-1 flex flex-col overflow-hidden relative">
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
          />
        </div>

        <div
          className={
            activeView === 'files' && fileBrowserHostId ? 'flex-1 flex flex-col' : 'hidden'
          }
        >
          <FilesView
            fileBrowserHostId={fileBrowserHostId || ''}
            fileBrowserHostAlias={fileBrowserHostAlias}
            setFileBrowserHostId={setFileBrowserHostId}
            setFileBrowserHostAlias={setFileBrowserHostAlias}
            setActiveView={setActiveView}
            hosts={hosts}
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
  )
}
