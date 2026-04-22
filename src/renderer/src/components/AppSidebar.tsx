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
import { useConfirm } from '../hooks/useConfirm'
import { Badge, IconButton, Surface, Tooltip } from './ui'
import { cn } from '../lib/utils'

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
}: AppSidebarProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const statusText = requireConfirmation ? '操作需确认' : '自动执行模式'
  const statusDescription = requireConfirmation ? '高危操作会询问您' : 'Agent 将直接执行'

  return (
    <aside
      className={cn(
        'glass-sidebar relative flex flex-col border-y-0 border-l-0 no-drag transition-[width] duration-200',
        sidebarCollapsed ? 'w-16' : 'w-72'
      )}
    >
      <Tooltip content={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'} side="right">
        <IconButton
          aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            'absolute -right-3 top-12 z-10 h-6 w-6 rounded-full border-white/80 bg-white/85 text-muted-foreground shadow-sm backdrop-blur-xl hover:text-accent',
            sidebarCollapsed && 'rotate-180'
          )}
        >
          <ChevronLeft size={14} />
        </IconButton>
      </Tooltip>

      <div className={cn('drag px-4 pb-5 pt-4', sidebarCollapsed && 'px-3 pt-6')}>
        {!sidebarCollapsed && (
          <div className="mb-5 flex h-3 items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-sm ring-1 ring-black/5" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-sm ring-1 ring-black/5" />
            <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-sm ring-1 ring-black/5" />
          </div>
        )}
        <div
          className={cn('flex items-center gap-3 no-drag', sidebarCollapsed && 'justify-center')}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/75 p-1 shadow-sm shadow-accent/10 backdrop-blur-xl">
            <img src={logo} alt="OpenTerm" className="h-full w-full object-contain" />
          </div>
          {!sidebarCollapsed && (
            <h1 className="truncate text-lg font-semibold leading-none tracking-normal text-foreground">
              OpenTerm
            </h1>
          )}
        </div>
      </div>

      <nav className={cn('space-y-1 px-3', sidebarCollapsed && 'px-2')}>
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
        <div className={cn('mt-5 flex-1 overflow-y-auto px-3', sidebarCollapsed && 'px-2')}>
          <div
            className={cn(
              'mb-2 flex items-center justify-between gap-2 px-1',
              sidebarCollapsed && 'justify-center'
            )}
          >
            {!sidebarCollapsed && (
              <span className="text-xs font-semibold text-muted-foreground">会话记录</span>
            )}
            <Tooltip content="新建会话" side={sidebarCollapsed ? 'right' : 'top'}>
              <IconButton
                aria-label="新建会话"
                onClick={() => onCreateTopic()}
                className={cn('h-7 w-7', sidebarCollapsed && 'w-full')}
              >
                <Plus size={14} />
              </IconButton>
            </Tooltip>
          </div>

          <div className="space-y-1">
            {topics.length === 0 && !sidebarCollapsed && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <MessageSquare size={26} className="mx-auto mb-2 opacity-40" />
                暂无会话
              </div>
            )}

            {topics.map((topic) => {
              const active = selectedTopic?.id === topic.id
              const topicItem = (
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
                  className={cn(
                    'group flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-all',
                    active
                      ? 'border-white/55 bg-black/5 text-foreground shadow-sm backdrop-blur-xl'
                      : 'border-transparent text-muted-foreground hover:border-white/70 hover:bg-white/60 hover:text-foreground',
                    sidebarCollapsed && 'justify-center px-0'
                  )}
                >
                  <div
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      active ? 'bg-foreground/55' : 'bg-border'
                    )}
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
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-inherit outline-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{topic.title}</span>
                      )}
                      {editingTopicId !== topic.id && (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton
                            aria-label="重命名话题"
                            onClick={(e) => {
                              e.stopPropagation()
                              onStartRenameTopic(topic)
                            }}
                            className="h-6 w-6"
                          >
                            <Pencil size={12} />
                          </IconButton>
                          <IconButton
                            aria-label="删除话题"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const ok = await confirm({
                                title: '删除话题',
                                message: `确定删除话题"${topic.title}"吗？此操作不可恢复。`,
                                confirmText: '删除',
                                variant: 'danger'
                              })
                              if (!ok) return
                              await onDeleteTopic(topic.id)
                            }}
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-danger"
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )

              return sidebarCollapsed ? (
                <Tooltip key={topic.id} content={topic.title} side="right">
                  {topicItem}
                </Tooltip>
              ) : (
                topicItem
              )
            })}
          </div>
        </div>
      )}

      <div className={cn('mt-auto p-3', sidebarCollapsed && 'px-2')}>
        {sidebarCollapsed ? (
          <Tooltip content={`${statusText}：${statusDescription}`} side="right">
            <div className="glass-control flex h-9 items-center justify-center rounded-lg">
              <ShieldAlert
                size={16}
                className={requireConfirmation ? 'text-success' : 'text-warning'}
              />
            </div>
          </Tooltip>
        ) : (
          <Surface padding="sm" className="rounded-lg">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                  requireConfirmation
                    ? 'bg-success-soft text-success'
                    : 'bg-warning-soft text-warning'
                )}
              >
                <ShieldAlert size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{statusText}</div>
                <div className="truncate text-xs text-muted-foreground">{statusDescription}</div>
              </div>
              <Badge variant={requireConfirmation ? 'success' : 'warning'}>
                {requireConfirmation ? '安全' : '自动'}
              </Badge>
            </div>
          </Surface>
        )}
      </div>
      {ConfirmDialogComponent}
    </aside>
  )
}
