import {
  Plus,
  LayoutGrid,
  MessageSquare,
  Settings,
  ChevronLeft,
  Pencil,
  Trash2,
  ShieldAlert
} from 'lucide-react'
import logo from '../assets/logo.png'
import { NavItem } from './NavItem'
import { View } from '../types'
import { Topic } from '../../../shared/types'

interface AppSidebarProps {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  activeView: View
  setActiveView: (v: View) => void
  hosts: { length: number }
  topics: Topic[]
  selectedTopic: Topic | null
  setSelectedTopic: (t: Topic) => void
  editingTopicId: string | null
  setEditingTopicId: (id: string | null) => void
  editingTopicTitle: string
  setEditingTopicTitle: (title: string) => void
  requireConfirmation: boolean
  onCreateTopic: () => void
  onStartRenameTopic: (topic: Topic) => void
  onCommitRenameTopic: () => void
  onDeleteTopic: (id: string) => Promise<void>
  setPrefilledText: (text: string) => void
}

export function AppSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  activeView,
  setActiveView,
  hosts,
  topics,
  selectedTopic,
  setSelectedTopic,
  editingTopicId,
  setEditingTopicId,
  editingTopicTitle,
  setEditingTopicTitle,
  requireConfirmation,
  onCreateTopic,
  onStartRenameTopic,
  onCommitRenameTopic,
  onDeleteTopic,
  setPrefilledText
}: AppSidebarProps) {
  return (
    <aside
      className={`${sidebarCollapsed ? 'w-20' : 'w-72'} bg-gray-50/80 border-r border-gray-100 flex flex-col no-drag transition-all duration-300 relative group`}
    >
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={`absolute -right-3 top-12 w-6 h-6 bg-white border border-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 shadow-sm transition-all z-10 opacity-0 group-hover:opacity-100 ${sidebarCollapsed ? 'rotate-180' : ''}`}
      >
        <ChevronLeft size={14} />
      </button>

      <div className={`pt-8 pb-6 drag transition-all ${sidebarCollapsed ? 'px-5' : 'px-7'}`}>
        <div className="flex items-center gap-3 no-drag">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center -ml-1 overflow-hidden bg-white shadow-sm border border-gray-50 p-1">
            <img src={logo} alt="OpenTerm" className="w-full h-full object-contain" />
          </div>
          {!sidebarCollapsed && (
            <h1 className="text-lg font-black tracking-tight text-gray-900 leading-none">
              OpenTerm
            </h1>
          )}
        </div>
      </div>

      <nav className="px-4 space-y-1">
        <NavItem
          active={activeView === 'hosts'}
          onClick={() => setActiveView('hosts')}
          icon={<LayoutGrid size={17} />}
          label={sidebarCollapsed ? '' : '主机'}
          count={sidebarCollapsed ? undefined : hosts.length}
          tooltip="主机列表"
        />
        <NavItem
          active={activeView === 'chat'}
          onClick={() => {
            setActiveView('chat')
            if (!selectedTopic && topics.length > 0) setSelectedTopic(topics[0])
          }}
          icon={<MessageSquare size={17} />}
          label={sidebarCollapsed ? '' : 'Agent助手'}
          count={sidebarCollapsed ? undefined : topics.length}
          tooltip="Agent助手"
        />
        <NavItem
          active={activeView === 'settings'}
          onClick={() => setActiveView('settings')}
          icon={<Settings size={17} />}
          label={sidebarCollapsed ? '' : '设置'}
          tooltip="设置"
        />
      </nav>

      {activeView === 'chat' && (
        <div className="flex-1 overflow-y-auto px-4 mt-6 scrollbar-hide">
          <div
            className={`flex items-center justify-between mb-3 px-2 ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            {!sidebarCollapsed && (
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                会话记录
              </span>
            )}
            <button
              onClick={() => onCreateTopic()}
              className={`p-1.5 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600 transition border border-transparent hover:border-gray-200 hover:shadow-sm ${sidebarCollapsed ? 'w-full flex justify-center' : ''}`}
              title="新建会话"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="space-y-1">
            {topics.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-xs">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                暂无会话
              </div>
            )}
            {topics.map((topic) => (
              <div
                key={topic.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedTopic(topic)
                  setPrefilledText('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedTopic(topic)
                    setPrefilledText('')
                  }
                }}
                className={`group w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                  selectedTopic?.id === topic.id
                    ? 'bg-white text-blue-600 shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-100'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedTopic?.id === topic.id ? 'bg-blue-500' : 'bg-gray-300'}`}
                />
                {!sidebarCollapsed && (
                  <>
                    {editingTopicId === topic.id ? (
                      <input
                        autoFocus
                        value={editingTopicTitle}
                        onChange={(e) => setEditingTopicTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={onCommitRenameTopic}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            onCommitRenameTopic()
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingTopicId(null)
                            setEditingTopicTitle('')
                          }
                        }}
                        className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-inherit"
                      />
                    ) : (
                      <span className="truncate flex-1">{topic.title}</span>
                    )}
                    {editingTopicId !== topic.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            onStartRenameTopic(topic)
                          }}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                          title="重命名"
                        >
                          <Pencil size={12} />
                        </span>
                        <span
                          onClick={async (e) => {
                            e.stopPropagation()
                            await onDeleteTopic(topic.id)
                          }}
                          className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 mt-auto">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                requireConfirmation
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-yellow-50 text-yellow-600'
              }`}
            >
              <ShieldAlert size={15} />
            </div>
            <div>
              <div className="text-xs font-black text-gray-900">
                {requireConfirmation ? '操作需确认' : '自动执行模式'}
              </div>
              <div className="text-[10px] text-gray-400">
                {requireConfirmation ? '高危操作会询问您' : 'Agent 将直接执行'}
              </div>
            </div>
            <div
              className={`ml-auto w-2 h-2 rounded-full ${
                requireConfirmation ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'
              }`}
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
