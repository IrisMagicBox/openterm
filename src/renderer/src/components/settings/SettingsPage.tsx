import { useState } from 'react'
import { Bot, ShieldAlert, ChevronLeft, Server, Shield } from 'lucide-react'
import { ProviderList } from './ProviderList'
import { ProviderSettings } from './ProviderSettings'
import { useProvider } from '../../hooks/useProvider'
import { usePermissions } from '../../hooks/usePermissions'
import type { Provider } from '../../../../shared/types'

interface SettingsPageProps {
  onBack?: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
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

  const handleResetProvider = async (id: string) => {
    await resetSystemProvider(id as any)
  }

  const handleAddProvider = () => {
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

  const handleSaveProvider = async (provider: Provider) => {
    await updateProvider(provider.id, provider)
  }

  const handleTestConnection = async (
    provider: Provider,
    modelId?: string
  ): Promise<{ ok: boolean; message: string }> => {
    return window.api.testProviderConnection(provider, modelId)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 drag">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition no-drag"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="no-drag">
          <h2 className="text-xl font-black text-gray-900">设置</h2>
          <p className="text-sm text-gray-400">配置 OpenTerm AI 模型和提供商</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-gray-100 bg-gray-50/50">
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('providers')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'providers'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              <Server size={16} />
              AI 提供商
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'general'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              <Bot size={16} />
              通用设置
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'permissions'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              <Shield size={16} />
              权限设置
            </button>
          </nav>

          <div className="px-4 py-4 border-t border-gray-100">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  requireConfirmation ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                }`}>
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
                <div className={`ml-auto w-2 h-2 rounded-full ${
                  requireConfirmation ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'
                }`} />
              </div>
            </div>
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
                <div className="bg-blue-50 rounded-xl p-6">
                  <h3 className="font-bold text-blue-900 mb-2">关于 AI Providers</h3>
                  <p className="text-sm text-blue-700">
                    OpenTerm 现在支持多个 AI 提供商。您可以在 Providers 标签页中配置和管理不同的 AI
                    服务， 包括 OpenAI、Anthropic、Gemini、DeepSeek、Silicon Flow 等 20+
                    个内置提供商。
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-gray-900">已配置的提供商</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {providers
                      .filter((p) => p.enabled)
                      .map((provider) => (
                        <div
                          key={provider.id}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                            <Server size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {provider.name}
                            </div>
                            <div className="text-xs text-gray-500">{provider.type}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                  {providers.filter((p) => p.enabled).length === 0 && (
                    <p className="text-sm text-gray-400 italic">
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
                <div className="bg-blue-50 rounded-xl p-6">
                  <h3 className="font-bold text-blue-900 mb-2">权限控制</h3>
                  <p className="text-sm text-blue-700">
                    配置 Agent 执行高权限操作时的行为。您可以选择让 Agent
                    直接执行操作，或在执行前征求您的确认。
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
                    <div>
                      <h4 className="font-semibold text-gray-900">高危操作需确认</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        Agent 执行删除文件、修改系统配置等高危操作前会询问您
                      </p>
                    </div>
                    <button
                      onClick={toggleRequireConfirmation}
                      disabled={permissionsLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        requireConfirmation ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          requireConfirmation ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
                    <div>
                      <h4 className="font-semibold text-gray-900">自动执行安全操作</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        允许 Agent 自动执行只读、查询类等安全操作，无需确认
                      </p>
                    </div>
                    <button
                      onClick={toggleAutoExecuteSafeOperations}
                      disabled={permissionsLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoExecuteSafeOperations ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoExecuteSafeOperations ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
