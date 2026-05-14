import { useEffect, useState } from 'react'
import {
  Brain,
  Bot,
  ChevronLeft,
  Server,
  Shield,
  Check
} from 'lucide-react'
import { ProviderList } from './ProviderList'
import { ProviderSettings } from './ProviderSettings'
import { MemorySettings } from './MemorySettings'
import { useProvider } from '../../hooks/useProvider'
import { usePermissions } from '../../hooks/usePermissions'
import { isSystemProviderId } from '../../config/providers'
import type {
  PermissionMode,
  Provider,
  TerminalCompletionBackendMode
} from '../../../../shared/types'
import {
  DEFAULT_TERMINAL_COMPLETION_MODE,
  normalizeTerminalCompletionMode
} from '../../lib/terminal-command-assist'
import { Badge, IconButton, PageHeader, Surface } from '../ui'
import { cn } from '../../lib/utils'

interface SettingsPageProps {
  onBack?: () => void
}

const TERMINAL_COMPLETION_MODE_OPTIONS: Array<{
  value: TerminalCompletionBackendMode
  label: string
  description: string
}> = [
  {
    value: 'prompt',
    label: '提示词',
    description: '兼容不支持函数调用的模型'
  },
  {
    value: 'function',
    label: '函数',
    description: '使用模型原生 tool call'
  }
]

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode
  title: string
  badge: string
  description: string
  variant: 'success' | 'accent' | 'warning'
}> = [
  {
    value: 'default',
    title: '默认权限',
    badge: '推荐',
    description:
      '读取当前话题、主机和终端上下文；写文件、端口转发、网页搜索和高风险命令会请求授权。',
    variant: 'success'
  },
  {
    value: 'auto_review',
    title: '自动审核',
    badge: '更少打断',
    description: '低中风险读取和联网查询可自动通过；写入、权限变更、端口转发和关键风险仍会询问。',
    variant: 'accent'
  },
  {
    value: 'full_access',
    title: '完全访问权限',
    badge: '高风险',
    description:
      '远程命令、文件写入、联网操作和端口转发会尽量自动执行；极度危险命令仍会被策略硬拦截。',
    variant: 'warning'
  }
]

export function SettingsPage({ onBack }: SettingsPageProps): React.ReactElement {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'providers' | 'general' | 'permissions' | 'memory'>(
    'providers'
  )
  const [terminalCompletionMode, setTerminalCompletionMode] =
    useState<TerminalCompletionBackendMode>(DEFAULT_TERMINAL_COMPLETION_MODE)
  const [completionSettingsLoading, setCompletionSettingsLoading] = useState(true)
  const [completionSettingsSaving, setCompletionSettingsSaving] = useState(false)

  const {
    providers,
    updateProvider,
    deleteProvider,
    toggleProviderEnabled,
    resetSystemProvider,
    createProvider,
    createModel,
    deleteModel,
    getModelsByProvider
  } = useProvider()

  const { loading: permissionsLoading, setPermissionMode, permissionMode } = usePermissions()

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || null

  useEffect(() => {
    let cancelled = false

    window.api
      .getModelSettings()
      .then((settings) => {
        if (!cancelled) {
          setTerminalCompletionMode(
            normalizeTerminalCompletionMode(settings.terminalCompletionMode)
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTerminalCompletionMode(DEFAULT_TERMINAL_COMPLETION_MODE)
        }
      })
      .finally(() => {
        if (!cancelled) setCompletionSettingsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleResetProvider = async (id: string): Promise<void> => {
    if (isSystemProviderId(id)) {
      await resetSystemProvider(id)
    }
  }

  const handleAddProvider = (): void => {
    const newProvider: Provider = {
      id: `custom-${Date.now()}`,
      name: 'OpenAI-compatible Provider',
      type: 'openai',
      apiKey: '',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    createProvider(newProvider)
    setSelectedProviderId(newProvider.id)
  }

  const handleSaveProvider = async (provider: Provider): Promise<void> => {
    await updateProvider(provider.id, provider)
  }

  const handleTestConnection = async (
    provider: Provider,
    modelId?: string
  ): Promise<{ ok: boolean; message: string }> => {
    return window.api.testProviderConnection(provider, modelId)
  }

  const handleTerminalCompletionModeChange = async (
    mode: TerminalCompletionBackendMode
  ): Promise<void> => {
    if (mode === terminalCompletionMode || completionSettingsSaving) return

    const previousMode = terminalCompletionMode
    setTerminalCompletionMode(mode)
    setCompletionSettingsSaving(true)
    try {
      await window.api.saveModelSettings({ terminalCompletionMode: mode })
    } catch {
      setTerminalCompletionMode(previousMode)
    } finally {
      setCompletionSettingsSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-app">
      <PageHeader
        title="设置"
        description="配置模型提供商、终端补全、权限和长期记忆"
        dense
        leading={
          onBack ? (
            <IconButton aria-label="返回" onClick={onBack}>
              <ChevronLeft size={18} />
            </IconButton>
          ) : undefined
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="settings-sidebar-surface w-56">
          <nav className="space-y-1 p-3">
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'providers'
                  ? 'border border-white/55 bg-black/5 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-white/65 hover:text-foreground'
              }`}
            >
              <Server size={14} />
              AI 提供商
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'general'
                  ? 'border border-white/55 bg-black/5 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-white/65 hover:text-foreground'
              }`}
            >
              <Bot size={14} />
              通用设置
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'permissions'
                  ? 'border border-white/55 bg-black/5 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-white/65 hover:text-foreground'
              }`}
            >
              <Shield size={14} />
              权限设置
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className={`flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'memory'
                  ? 'border border-white/55 bg-black/5 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-white/65 hover:text-foreground'
              }`}
            >
              <Brain size={14} />
              记忆管理
            </button>
          </nav>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'providers' && (
            <>
              <ProviderList
                providers={providers}
                selectedProviderId={selectedProviderId}
                onSelectProvider={(p) => setSelectedProviderId(p.id)}
                onToggleEnabled={toggleProviderEnabled}
                onAddProvider={handleAddProvider}
                onDeleteProvider={deleteProvider}
                onResetProvider={handleResetProvider}
              />
              <div className="flex-1 overflow-y-auto">
                <ProviderSettings
                  provider={selectedProvider}
                  models={selectedProvider ? getModelsByProvider(selectedProvider.id) : []}
                  onSave={handleSaveProvider}
                  onTestConnection={handleTestConnection}
                  onAddModel={createModel}
                  onRemoveModel={deleteModel}
                />
              </div>
            </>
          )}

          {activeTab === 'general' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-xl space-y-3">
                <Surface padding="sm" className="rounded-md px-3 py-2.5">
                  <h3 className="mb-1 text-[13px] font-bold text-foreground">关于模型提供商</h3>
                  <p className="text-xs leading-4 text-muted-foreground">
                    OpenTerm 支持多个模型提供商。您可以在“AI
                    提供商”中管理 OpenAI-compatible、Anthropic、Gemini、Ollama、Azure
                    OpenAI 以及其他内置服务。
                  </p>
                </Surface>

                <Surface
                  padding="sm"
                  className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-bold text-foreground">大模型补全</h3>
                    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                      默认使用提示词解析；函数模式适合支持 tool call 的模型。
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-md border border-border bg-white/65 p-0.5 shadow-sm">
                    {TERMINAL_COMPLETION_MODE_OPTIONS.map((option) => {
                      const selected = terminalCompletionMode === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          disabled={completionSettingsLoading || completionSettingsSaving}
                          onClick={() => {
                            void handleTerminalCompletionModeChange(option.value)
                          }}
                          className={`min-w-14 rounded px-2 py-1 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected
                              ? 'bg-accent text-white shadow-sm'
                              : 'text-muted-foreground hover:bg-white hover:text-foreground'
                          }`}
                        >
                          <span className="block text-xs font-semibold leading-tight">
                            {option.label}
                          </span>
                          <span
                            className={`mt-0.5 block text-[11px] leading-tight ${
                              selected ? 'text-white/75' : 'text-muted-foreground'
                            }`}
                          >
                            {option.description}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Surface>

                <div className="space-y-2.5">
                  <h3 className="text-[13px] font-bold text-foreground">已配置的提供商</h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {providers
                      .filter((p) => p.enabled)
                      .map((provider) => (
                        <Surface
                          key={provider.id}
                          padding="sm"
                          className="flex items-center gap-2 rounded-md px-3 py-2.5"
                        >
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-accent-soft text-accent">
                            <Server size={12} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-xs font-medium text-foreground">
                              {provider.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{provider.type}</div>
                          </div>
                        </Surface>
                      ))}
                  </div>
                  {providers.filter((p) => p.enabled).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      暂无启用的提供商。请前往“AI 提供商”启用至少一个提供商。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-xl space-y-3">
                <Surface padding="sm" className="rounded-md px-3 py-2.5">
                  <h3 className="mb-1 text-[13px] font-bold text-foreground">权限控制</h3>
                  <p className="text-xs leading-4 text-muted-foreground">
                    配置 Agent 在 OpenTerm
                    中读取上下文、执行远程命令、写文件、联网搜索和创建端口转发时的审批方式。
                  </p>
                </Surface>

                <div className="overflow-hidden rounded-md border border-black/[0.08] bg-white">
                  {PERMISSION_MODE_OPTIONS.map((option, index) => {
                    const selected = permissionMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void setPermissionMode(option.value)}
                        disabled={permissionsLoading}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-[background-color,color,opacity] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-interactive)] disabled:cursor-wait disabled:opacity-60',
                          index > 0 && 'border-t border-black/[0.06]',
                          selected ? 'bg-black/[0.025]' : 'hover:bg-black/[0.015]'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <h4 className="text-[13px] font-semibold leading-4 text-foreground">
                              {option.title}
                            </h4>
                            <Badge variant={option.variant} className="min-h-4 px-1.5 text-[10px]">
                              {option.badge}
                            </Badge>
                          </div>
                          <p className="text-xs leading-4 text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                        <div
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition',
                            selected
                              ? 'border-accent bg-accent text-white'
                              : 'border-black/[0.12] bg-white text-transparent'
                          )}
                        >
                          <Check size={10} strokeWidth={2.5} />
                        </div>
                      </button>
                    )
                  })}
                </div>

                <Surface padding="sm" className="rounded-md px-3 py-2.5">
                  <h4 className="text-[13px] font-semibold text-foreground">硬性保护</h4>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                    无论选择哪种模式，极度危险的系统级命令仍会被策略拦截；Agent
                    的具体工具可见性仍受内置 Agent 角色限制。
                  </p>
                </Surface>
                {permissionMode === 'full_access' && (
                  <Surface
                    padding="sm"
                    className="rounded-md border-warning/25 bg-warning-soft px-3 py-2.5"
                  >
                    <h4 className="text-[13px] font-semibold text-warning">完全访问权限已启用</h4>
                    <p className="mt-0.5 text-xs leading-4 text-warning">
                      Agent 会更少请求确认，可能直接写文件、访问网络、创建端口转发或执行远程变更。
                      请只在可信任务和可信主机上使用。
                    </p>
                  </Surface>
                )}
              </div>
            </div>
          )}

          {activeTab === 'memory' && <MemorySettings />}
        </div>
      </div>
    </div>
  )
}
