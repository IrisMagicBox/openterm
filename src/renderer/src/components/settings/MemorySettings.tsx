import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Clipboard,
  Edit3,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2
} from 'lucide-react'
import type {
  GlobalMemoryData,
  GlobalMemoryFact,
  GlobalMemoryFactCategory,
  MemoryEntry,
  MemoryScope
} from '../../../../shared/types'
import {
  Badge,
  Button,
  ConfirmActionButton,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Surface,
  Textarea
} from '../ui'
import { cn } from '../../lib/utils'

type ScopeFilter = 'all' | MemoryScope | 'disabled'
type TypeFilter = 'all' | MemoryEntry['type']

const SCOPE_OPTIONS: Array<{ value: ScopeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'global', label: '全局' },
  { value: 'topic', label: 'Topic' },
  { value: 'host', label: '主机' },
  { value: 'disabled', label: '已禁用' }
]

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'user_preference', label: '用户偏好' },
  { value: 'host_fact', label: '主机事实' },
  { value: 'topic_summary', label: 'Topic 摘要' },
  { value: 'task_experience', label: '任务经验' },
  { value: 'policy_hint', label: '策略提示' }
]

const FACT_CATEGORIES: GlobalMemoryFactCategory[] = [
  'preference',
  'knowledge',
  'context',
  'behavior',
  'goal',
  'correction'
]

function scopeLabel(scope: MemoryScope): string {
  if (scope === 'global') return '全局'
  if (scope === 'topic') return 'Topic'
  return '主机'
}

function typeLabel(type: MemoryEntry['type']): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString()
}

function sectionSummary(section?: { summary: string; updatedAt?: number }): string {
  return section?.summary?.trim() || '暂无内容'
}

export function MemorySettings(): React.ReactElement {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [globalMemory, setGlobalMemory] = useState<GlobalMemoryData | null>(null)
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [editingFactId, setEditingFactId] = useState<string | null>(null)
  const [factDrafts, setFactDrafts] = useState<Record<string, string>>({})
  const [newFactContent, setNewFactContent] = useState('')
  const [newFactCategory, setNewFactCategory] = useState<GlobalMemoryFactCategory>('context')
  const [loading, setLoading] = useState(true)
  const [savingFact, setSavingFact] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextMemories, nextGlobal] = await Promise.all([
        window.api.getMemories({ includeDisabled: true }),
        window.api.getGlobalMemory()
      ])
      setMemories([...nextMemories].sort((a, b) => b.importance - a.importance))
      setGlobalMemory(nextGlobal)
      setDrafts((prev) => {
        const next = { ...prev }
        for (const memory of nextMemories) {
          if (next[memory.id] === undefined) next[memory.id] = memory.content
        }
        return next
      })
      setFactDrafts((prev) => {
        const next = { ...prev }
        for (const fact of nextGlobal.facts) {
          if (next[fact.id] === undefined) next[fact.id] = fact.content
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return memories.filter((memory) => {
      if (scopeFilter === 'disabled') {
        if (!memory.disabled) return false
      } else if (scopeFilter !== 'all' && memory.scope !== scopeFilter) {
        return false
      }
      if (typeFilter !== 'all' && memory.type !== typeFilter) return false
      if (!normalizedQuery) return true
      return [
        memory.content,
        memory.hostId,
        memory.topicId,
        memory.sourceTaskId,
        memory.type,
        memory.scope
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
  }, [memories, query, scopeFilter, typeFilter])

  const updateMemory = async (
    memory: MemoryEntry,
    updates: Parameters<typeof window.api.updateMemory>[1]
  ): Promise<void> => {
    await window.api.updateMemory(memory.id, updates)
    await refresh()
  }

  const deleteMemory = async (memory: MemoryEntry): Promise<void> => {
    await window.api.deleteMemory(memory.id)
    await refresh()
  }

  const createFact = async (): Promise<void> => {
    const content = newFactContent.trim()
    if (!content || savingFact) return
    setSavingFact(true)
    try {
      await window.api.createGlobalMemoryFact({
        content,
        category: newFactCategory,
        source: 'settings'
      })
      setNewFactContent('')
      await refresh()
    } finally {
      setSavingFact(false)
    }
  }

  const updateFact = async (fact: GlobalMemoryFact): Promise<void> => {
    const content = factDrafts[fact.id]?.trim()
    if (!content) return
    await window.api.updateGlobalMemoryFact(fact.id, { content })
    setEditingFactId(null)
    await refresh()
  }

  const deleteFact = async (fact: GlobalMemoryFact): Promise<void> => {
    await window.api.deleteGlobalMemoryFact(fact.id)
    await refresh()
  }

  const clearGlobalMemory = async (): Promise<void> => {
    await window.api.clearGlobalMemory()
    await refresh()
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">记忆管理</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              查看和治理 Agent 自动提取、手动维护和全局画像中的长期记忆。
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            刷新
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-3">
            <Surface padding="sm" className="rounded-md px-3 py-3">
              <div className="flex flex-col gap-2 lg:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索内容、来源、Topic 或主机"
                    className="pl-8"
                  />
                </div>
                <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
                  <SelectTrigger className="lg:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                  <SelectTrigger className="lg:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Surface>

            <div className="space-y-2">
              {loading && memories.length === 0 ? (
                <Surface padding="sm" className="rounded-md px-3 py-4 text-xs text-muted-foreground">
                  正在读取记忆...
                </Surface>
              ) : filteredMemories.length === 0 ? (
                <Surface padding="sm" className="rounded-md px-3 py-4 text-xs text-muted-foreground">
                  没有符合条件的记忆。
                </Surface>
              ) : (
                filteredMemories.map((memory) => {
                  const editing = editingMemoryId === memory.id
                  const draft = drafts[memory.id] ?? memory.content
                  return (
                    <Surface
                      key={memory.id}
                      padding="sm"
                      className={cn(
                        'rounded-md px-3 py-3',
                        memory.disabled && 'opacity-65'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="neutral">{scopeLabel(memory.scope)}</Badge>
                            <Badge variant="neutral">{typeLabel(memory.type)}</Badge>
                            {memory.disabled && <Badge variant="warning">已禁用</Badge>}
                            <Badge variant="accent">重要性 {memory.importance}</Badge>
                            <Badge variant="neutral">
                              {Math.round((memory.confidence ?? 0.7) * 100)}%
                            </Badge>
                          </div>

                          {editing ? (
                            <Textarea
                              value={draft}
                              onChange={(event) =>
                                setDrafts((prev) => ({ ...prev, [memory.id]: event.target.value }))
                              }
                              className="mt-3 min-h-28"
                            />
                          ) : (
                            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                              {memory.content}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
                            {memory.hostId && <span>host={memory.hostId}</span>}
                            {memory.topicId && <span>topic={memory.topicId}</span>}
                            {memory.sourceTaskId && <span>task={memory.sourceTaskId}</span>}
                            <span>created={formatTime(memory.timestamp)}</span>
                            {memory.lastUsedAt && <span>used={formatTime(memory.lastUsedAt)}</span>}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton
                            aria-label="降低重要性"
                            className="h-7 w-7"
                            onClick={() =>
                              void updateMemory(memory, {
                                importance: Math.max(0, memory.importance - 1)
                              })
                            }
                          >
                            <Minus size={12} />
                          </IconButton>
                          <IconButton
                            aria-label="提升重要性"
                            className="h-7 w-7"
                            onClick={() =>
                              void updateMemory(memory, {
                                importance: Math.min(10, memory.importance + 1)
                              })
                            }
                          >
                            <Plus size={12} />
                          </IconButton>
                          {editing ? (
                            <IconButton
                              aria-label="保存记忆"
                              className="h-7 w-7 text-success"
                              onClick={() => {
                                void updateMemory(memory, { content: draft })
                                setEditingMemoryId(null)
                              }}
                            >
                              <Save size={12} />
                            </IconButton>
                          ) : (
                            <IconButton
                              aria-label="编辑记忆"
                              className="h-7 w-7"
                              onClick={() => setEditingMemoryId(memory.id)}
                            >
                              <Edit3 size={12} />
                            </IconButton>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => void updateMemory(memory, { disabled: !memory.disabled })}
                          >
                            {memory.disabled ? '启用' : '禁用'}
                          </Button>
                          <ConfirmActionButton
                            aria-label="删除记忆"
                            className="blue-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-danger no-drag hover:bg-white/60"
                            confirmClassName="hover:bg-danger-strong"
                            confirmingTitle="删除记忆"
                            onConfirm={() => void deleteMemory(memory)}
                          >
                            <Trash2 size={12} />
                          </ConfirmActionButton>
                        </div>
                      </div>
                    </Surface>
                  )
                })
              )}
            </div>
          </section>

          <aside className="space-y-3">
            <Surface padding="sm" className="rounded-md px-3 py-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <Brain size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">全局画像</h3>
                    <p className="text-[11px] text-muted-foreground">
                      更新于 {formatTime(globalMemory?.lastUpdated)}
                    </p>
                  </div>
                </div>
                <IconButton
                  aria-label="复制全局记忆 JSON"
                  className="h-7 w-7"
                  disabled={!globalMemory}
                  onClick={() =>
                    globalMemory &&
                    void navigator.clipboard.writeText(JSON.stringify(globalMemory, null, 2))
                  }
                >
                  <Clipboard size={12} />
                </IconButton>
              </div>

              <div className="space-y-2 text-xs leading-5">
                <ProfileLine label="工作" value={sectionSummary(globalMemory?.user.workContext)} />
                <ProfileLine label="个人" value={sectionSummary(globalMemory?.user.personalContext)} />
                <ProfileLine label="当前关注" value={sectionSummary(globalMemory?.user.topOfMind)} />
                <ProfileLine label="近期" value={sectionSummary(globalMemory?.history.recentMonths)} />
                <ProfileLine
                  label="长期背景"
                  value={sectionSummary(globalMemory?.history.longTermBackground)}
                />
              </div>

              <ConfirmActionButton
                aria-label="清空全局画像"
                className="blue-ring mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-danger/15 text-xs font-bold text-danger no-drag hover:bg-danger-soft"
                confirmClassName="hover:bg-danger-strong"
                confirmingTitle="清空全局画像"
                onConfirm={() => void clearGlobalMemory()}
              >
                清空全局画像
              </ConfirmActionButton>
            </Surface>

            <Surface padding="sm" className="rounded-md px-3 py-3">
              <h3 className="text-sm font-bold text-foreground">全局 Facts</h3>
              <div className="mt-2 flex gap-2">
                <Select
                  value={newFactCategory}
                  onValueChange={(value) => setNewFactCategory(value as GlobalMemoryFactCategory)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newFactContent}
                  onChange={(event) => setNewFactContent(event.target.value)}
                  placeholder="新增全局事实"
                />
                <Button size="sm" onClick={() => void createFact()} disabled={savingFact}>
                  <Plus size={13} />
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {(globalMemory?.facts ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无全局 facts。</p>
                ) : (
                  globalMemory!.facts.map((fact) => {
                    const editing = editingFactId === fact.id
                    const draft = factDrafts[fact.id] ?? fact.content
                    return (
                      <article
                        key={fact.id}
                        className="rounded-md border border-white/70 bg-white/55 px-2.5 py-2"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="neutral">{fact.category}</Badge>
                            <Badge variant="neutral">{Math.round(fact.confidence * 100)}%</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            {editing ? (
                              <IconButton
                                aria-label="保存全局 fact"
                                className="h-7 w-7 text-success"
                                onClick={() => void updateFact(fact)}
                              >
                                <Save size={12} />
                              </IconButton>
                            ) : (
                              <IconButton
                                aria-label="编辑全局 fact"
                                className="h-7 w-7"
                                onClick={() => setEditingFactId(fact.id)}
                              >
                                <Edit3 size={12} />
                              </IconButton>
                            )}
                            <ConfirmActionButton
                              aria-label="删除全局 fact"
                              className="blue-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-danger no-drag hover:bg-white/60"
                              confirmClassName="hover:bg-danger-strong"
                              confirmingTitle="删除全局 fact"
                              onConfirm={() => void deleteFact(fact)}
                            >
                              <Trash2 size={12} />
                            </ConfirmActionButton>
                          </div>
                        </div>
                        {editing ? (
                          <Textarea
                            value={draft}
                            onChange={(event) =>
                              setFactDrafts((prev) => ({ ...prev, [fact.id]: event.target.value }))
                            }
                            className="min-h-20 text-xs"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                            {fact.content}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{fact.source}</span>
                          {fact.sourceTaskId && <span>task={fact.sourceTaskId}</span>}
                          {fact.sourceRunId && <span>run={fact.sourceRunId}</span>}
                          {fact.sourceError && <span className="text-danger">{fact.sourceError}</span>}
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </Surface>
          </aside>
        </div>
      </div>
    </div>
  )
}

function ProfileLine({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-md border border-white/65 bg-white/45 px-2.5 py-2">
      <div className="mb-1 text-[11px] font-bold text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap break-words text-foreground">{value}</div>
    </div>
  )
}
