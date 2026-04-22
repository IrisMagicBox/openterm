import { useState } from 'react'
import { Bot, ShieldAlert, ChevronLeft, Server, Shield } from 'lucide-react'
import { ProviderList } from './ProviderList'
import { ProviderSettings } from './ProviderSettings'
import { useProvider } from '../../hooks/useProvider'
import { usePermissions } from '../../hooks/usePermissions'
import { isSystemProviderId } from '../../config/providers'
import type { Provider } from '../../../../shared/types'
import { Badge, IconButton, PageHeader, Surface, Switch } from '../ui'

interface SettingsPageProps {
  onBack?: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps): React.ReactElement {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'providers' | 'general' | 'permissions'>('providers')

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

  const {
    loading: permissionsLoading,
    toggleRequireConfirmation,
    toggleAutoExecuteSafeOperations,
    requireConfirmation,
    autoExecuteSafeOperations
  } = usePermissions()

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || null

  const handleResetProvider = async (id: string): Promise<void> => {
    if (isSystemProviderId(id)) {
      await resetSystemProvider(id)
    }
  }

  const handleAddProvider = (): void => {
    const newProvider: Provider = {
      id: `custom-${Date.now()}`,
      name: 'Custom Provider',
      type: 'openai',
      apiKey: '',
      apiHost: 'https://api.example.com',
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

  return (
    <div className="flex-1 flex flex-col h-full bg-app">
      <PageHeader
        title="设置"
        description="配置 OpenTerm AI 模型、提供商和权限"
        leading={
          onBack ? (
            <IconButton aria-label="返回" onClick={onBack}>
              <ChevronLeft size={18} />
            </IconButton>
          ) : undefined
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-border bg-app">
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('providers')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'providers'
                  ? 'bg-accent text-white'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`}
            >
              <Server size={16} />
              AI 提供商
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'general'
                  ? 'bg-accent text-white'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`}
            >
              <Bot size={16} />
              通用设置
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'permissions'
                  ? 'bg-accent text-white'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`}
            >
              <Shield size={16} />
              权限设置
            </button>
          </nav>

          <div className="px-4 py-4 border-t border-border">
            <Surface padding="sm">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center ${
                    requireConfirmation
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft text-warning'
                  }`}
                >
                  <ShieldAlert size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {requireConfirmation ? '操作需确认' : '自动执行模式'}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {requireConfirmation ? '高危操作会询问您' : 'Agent 将直接执行'}
                  </div>
                </div>
                <Badge variant={requireConfirmation ? 'success' : 'warning'}>
                  {requireConfirmation ? '安全' : '自动'}
                </Badge>
              </div>
            </Surface>
          </div>
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
            <div className="flex-1 p-8">
              <div className="max-w-2xl space-y-6">
                <Surface>
                  <h3 className="font-bold text-foreground mb-2">关于 AI Providers</h3>
                  <p className="text-sm text-muted-foreground">
                    OpenTerm 现在支持多个 AI 提供商。您可以在 Providers 标签页中配置和管理不同的 AI
                    服务， 包括 OpenAI、Anthropic、Gemini、DeepSeek、Silicon Flow 等 20+
                    个内置提供商。
                  </p>
                </Surface>

                <div className="space-y-4">
                  <h3 className="font-bold text-foreground">已配置的提供商</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {providers
                      .filter((p) => p.enabled)
                      .map((provider) => (
                        <Surface key={provider.id} padding="sm" className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-accent-soft text-accent rounded-md flex items-center justify-center">
                            <Server size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">
                              {provider.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{provider.type}</div>
                          </div>
                        </Surface>
                      ))}
                  </div>
                  {providers.filter((p) => p.enabled).length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      暂无启用的提供商。请前往 Providers 标签页启用至少一个提供商。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="max-w-2xl space-y-6">
                <Surface>
                  <h3 className="font-bold text-foreground mb-2">权限控制</h3>
                  <p className="text-sm text-muted-foreground">
                    配置 Agent 执行高权限操作时的行为。您可以选择让 Agent
                    直接执行操作，或在执行前征求您的确认。
                  </p>
                </Surface>

                <div className="space-y-4">
                  <Surface className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-foreground">高危操作需确认</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Agent 执行删除文件、修改系统配置等高危操作前会询问您
                      </p>
                    </div>
                    <Switch
                      checked={requireConfirmation}
                      onCheckedChange={toggleRequireConfirmation}
                      disabled={permissionsLoading}
                    />
                  </Surface>

                  <Surface className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-foreground">自动执行安全操作</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        允许 Agent 自动执行只读、查询类等安全操作，无需确认
                      </p>
                    </div>
                    <Switch
                      checked={autoExecuteSafeOperations}
                      onCheckedChange={toggleAutoExecuteSafeOperations}
                      disabled={permissionsLoading}
                    />
                  </Surface>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
