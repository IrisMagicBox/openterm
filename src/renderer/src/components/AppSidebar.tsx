import { useState, type ReactElement, type ReactNode } from 'react'
import {
  Plus,
  LayoutGrid,
  Terminal,
  Folder,
  MessageSquare,
  Settings,
  Pencil,
  Trash2,
  ShieldAlert
} from 'lucide-react'
import { NavItem } from './NavItem'
import { View, WorkspaceWindowItem } from '../types'
import { Topic } from '../../../shared/types'
import { Badge, ConfirmActionButton, IconButton, Surface, Tooltip } from './ui'
import { cn } from '../lib/utils'

interface AppSidebarProps {
  compactSidebar: boolean
  isResizingSidebar: boolean
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
  terminalWindows: WorkspaceWindowItem[]
  fileWindows: WorkspaceWindowItem[]
  activeTerminalId: string | null
  activeFileWindowId: string | null
  onSelectTerminalWindow: (id: string) => void
  onSelectFileWindow: (id: string) => void
  onRenameTerminalWindow: (id: string, title: string) => void
  onRenameFileWindow: (id: string, title: string) => void
  onDeleteTerminalWindow: (id: string) => void
  onDeleteFileWindow: (id: string) => void
}

export function AppSidebar({
  compactSidebar,
  isResizingSidebar,
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
  setPrefilledText,
  terminalWindows,
  fileWindows,
  activeTerminalId,
  activeFileWindowId,
  onSelectTerminalWindow,
  onSelectFileWindow,
  onRenameTerminalWindow,
  onRenameFileWindow,
  onDeleteTerminalWindow,
  onDeleteFileWindow
}: AppSidebarProps): ReactElement {
  const [editingWindowKey, setEditingWindowKey] = useState<string | null>(null)
  const [editingWindowTitle, setEditingWindowTitle] = useState('')
  const statusText = requireConfirmation ? '操作需确认' : '自动执行模式'
  const statusDescription = requireConfirmation ? '高危操作会询问您' : 'Agent 将直接执行'

  const renderWindowList = (
    title: string,
    items: WorkspaceWindowItem[],
    activeId: string | null,
    onSelect: (id: string) => void,
    onRename: (id: string, title: string) => void,
    onDelete: (id: string) => void
  ): ReactNode => {
    if (compactSidebar) return null

    const commitRename = (item: WorkspaceWindowItem): void => {
      const nextTitle = editingWindowTitle.trim()
      if (nextTitle && nextTitle !== item.title) {
        onRename(item.id, nextTitle)
      }
      setEditingWindowKey(null)
      setEditingWindowTitle('')
    }

    return (
      <div className="mt-2 px-3">
        <div className="mb-1 px-1 text-xs font-semibold text-muted-foreground">{title}</div>
        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="rounded-lg px-2.5 py-2 text-xs text-muted-foreground/75">暂无窗口</div>
          ) : (
            items.map((item) => {
              const active = item.id === activeId
              const itemKey = `${title}:${item.id}`
              const editing = editingWindowKey === itemKey
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(item.id)
                    }
                  }}
                  className={cn(
                    'group flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-left text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-interactive)]',
                    active
                      ? 'border-black/[0.045] bg-black/[0.055] text-foreground shadow-none backdrop-blur-0'
                      : 'border-transparent text-muted-foreground hover:border-black/[0.04] hover:bg-black/[0.035] hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      active ? 'bg-accent' : 'bg-border group-hover:bg-muted-foreground/40'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    {editing ? (
                      <input
                        autoFocus
                        value={editingWindowTitle}
                        onChange={(e) => setEditingWindowTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(item)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRename(item)
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingWindowKey(null)
                            setEditingWindowTitle('')
                          }
                        }}
                        className="block w-full bg-transparent text-[13px] font-medium text-inherit outline-none"
                      />
                    ) : (
                      <span className="block truncate">{item.title}</span>
                    )}
                    <span className="block truncate font-mono text-xs font-normal text-muted-foreground">
                      {item.subtitle}
                    </span>
                  </span>
                  {!editing && (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton
                        aria-label="重命名窗口"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingWindowKey(itemKey)
                          setEditingWindowTitle(item.title)
                        }}
                        className="h-6 w-6"
                      >
                        <Pencil size={12} />
                      </IconButton>
                      <ConfirmActionButton
                        aria-label="删除窗口"
                        onConfirm={() => {
                          onDelete(item.id)
                        }}
                        stopPropagation
                        className="blue-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground no-drag hover:bg-white/60 hover:text-danger"
                        confirmClassName="hover:bg-danger-strong"
                        confirmingTitle="关闭"
                      >
                        <Trash2 size={12} />
                      </ConfirmActionButton>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'app-sidebar-content relative z-10 flex shrink-0 flex-col overflow-hidden border-y-0 border-l-0 no-drag',
        isResizingSidebar
          ? 'transition-none'
          : 'transition-[width] duration-[var(--motion-duration-slow)] ease-[var(--motion-ease-emphasized)]'
      )}
    >
      <div aria-hidden className="sidebar-frosted-veil" />

      <div className={cn('relative px-4 pb-5 pt-4', compactSidebar && 'px-3')}>
        <div aria-hidden className="sidebar-titlebar-drag-region" />
        {!compactSidebar && <div aria-hidden className="mb-5 h-3" />}
        <div
          className={cn('flex min-h-9 items-center no-drag', compactSidebar && 'justify-center')}
        >
          {!compactSidebar && (
            <h1 className="truncate text-lg font-semibold leading-none tracking-normal text-foreground">
              OpenTerm
            </h1>
          )}
        </div>
      </div>

      <nav className={cn('space-y-1 px-3', compactSidebar && 'px-2')}>
        <NavItem
          active={activeView === 'hosts'}
          onClick={() => setActiveView('hosts')}
          icon={<LayoutGrid size={15} />}
          label={compactSidebar ? '' : '主机'}
          count={compactSidebar ? undefined : hosts.length}
          tooltip="主机列表"
        />
        <NavItem
          active={activeView === 'terminal'}
          onClick={() => setActiveView('terminal')}
          icon={<Terminal size={15} />}
          label={compactSidebar ? '' : '终端'}
          count={terminalWindows.length > 0 ? terminalWindows.length : undefined}
          tooltip="手动终端"
        />
        <NavItem
          active={activeView === 'files'}
          onClick={() => setActiveView('files')}
          icon={<Folder size={15} />}
          label={compactSidebar ? '' : '文件'}
          count={fileWindows.length > 0 ? fileWindows.length : undefined}
          tooltip="文件窗口"
        />
        <NavItem
          active={activeView === 'chat'}
          onClick={() => {
            setActiveView('chat')
            if (!selectedTopic && topics.length > 0) setSelectedTopic(topics[0])
          }}
          icon={<MessageSquare size={15} />}
          label={compactSidebar ? '' : 'Agent助手'}
          count={compactSidebar ? undefined : topics.length}
          tooltip="Agent助手"
        />
        <NavItem
          active={activeView === 'settings'}
          onClick={() => setActiveView('settings')}
          icon={<Settings size={15} />}
          label={compactSidebar ? '' : '设置'}
          tooltip="设置"
        />
      </nav>

      {activeView === 'terminal' &&
        renderWindowList(
          '手动终端',
          terminalWindows,
          activeTerminalId,
          onSelectTerminalWindow,
          onRenameTerminalWindow,
          onDeleteTerminalWindow
        )}

      {activeView === 'files' &&
        renderWindowList(
          '文件窗口',
          fileWindows,
          activeFileWindowId,
          onSelectFileWindow,
          onRenameFileWindow,
          onDeleteFileWindow
        )}

      {activeView === 'chat' && (
        <div className={cn('mt-5 flex-1 overflow-y-auto px-3', compactSidebar && 'px-2')}>
          <div
            className={cn(
              'mb-2 flex items-center justify-between gap-2 px-1',
              compactSidebar && 'justify-center'
            )}
          >
            {!compactSidebar && (
              <span className="text-xs font-semibold text-muted-foreground">会话记录</span>
            )}
            <Tooltip content="新建会话" side={compactSidebar ? 'right' : 'top'}>
              <IconButton
                aria-label="新建会话"
                onClick={() => onCreateTopic()}
                className={cn('h-7 w-7', compactSidebar && 'w-full')}
              >
                <Plus size={14} />
              </IconButton>
            </Tooltip>
          </div>

          <div className="space-y-1">
            {topics.length === 0 && !compactSidebar && (
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
                    'group flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-interactive)]',
                    active
                      ? 'border-black/[0.045] bg-black/[0.055] text-foreground shadow-none backdrop-blur-0'
                      : 'border-transparent text-muted-foreground hover:border-black/[0.04] hover:bg-black/[0.035] hover:text-foreground',
                    compactSidebar && 'justify-center px-0'
                  )}
                >
                  <div
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      active ? 'bg-foreground/55' : 'bg-border'
                    )}
                  />
                  {!compactSidebar && (
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
                          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-inherit outline-none"
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
                          <ConfirmActionButton
                            aria-label="删除话题"
                            onConfirm={async () => {
                              await onDeleteTopic(topic.id)
                            }}
                            stopPropagation
                            className="blue-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground no-drag hover:bg-white/60 hover:text-danger"
                            confirmClassName="hover:bg-danger-strong"
                            confirmingTitle="删除"
                          >
                            <Trash2 size={12} />
                          </ConfirmActionButton>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )

              return compactSidebar ? (
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

      <div className={cn('mt-auto p-3', compactSidebar && 'px-2')}>
        {compactSidebar ? (
          <Tooltip content={`${statusText}：${statusDescription}`} side="right">
            <div className="glass-control flex h-9 items-center justify-center rounded-lg">
              <ShieldAlert
                size={16}
                className={requireConfirmation ? 'text-success' : 'text-warning'}
              />
            </div>
          </Tooltip>
        ) : (
          <Surface
            variant="subtle"
            padding="sm"
            className="rounded-lg border-white/20 bg-white/[0.08] shadow-none backdrop-blur-xl"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                  requireConfirmation
                    ? 'bg-success-soft text-success'
                    : 'bg-warning-soft text-warning'
                )}
              >
                <ShieldAlert size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-foreground">
                  {statusText}
                </div>
                <div className="truncate text-xs text-muted-foreground">{statusDescription}</div>
              </div>
              <Badge
                variant={requireConfirmation ? 'success' : 'warning'}
                className="min-h-4 px-1.5 text-[10px]"
              >
                {requireConfirmation ? '安全' : '自动'}
              </Badge>
            </div>
          </Surface>
        )}
      </div>
    </aside>
  )
}
