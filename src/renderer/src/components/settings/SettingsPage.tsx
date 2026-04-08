import { useState } from 'react'
import { Bot, ShieldAlert, ChevronLeft, Server } from 'lucide-react'
import { ProviderList } from './ProviderList'
import { ProviderSettings } from './ProviderSettings'
import { useProvider } from '../../hooks/useProvider'
import type { Provider } from '../../../../shared/types'

interface SettingsPageProps {
  onBack?: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'providers' | 'general'>('providers')

  const {
    providers,
    updateProvider,
    deleteProvider,
    toggleProviderEnabled,
    resetSystemProvider,
    createProvider
  } = useProvider()

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || null

  const handleResetProvider = (id: string) => {
    resetSystemProvider(id as any)
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

  const handleSaveProvider = (provider: Provider) => {
    updateProvider(provider.id, provider)
  }

  const handleTestConnection = async (provider: Provider): Promise<boolean> => {
    try {
      const response = await fetch(`${provider.apiHost}/v1/models`, {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`
        }
      })
      return response.ok
    } catch {
      return false
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div>
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
              AI Providers
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
              General Settings
            </button>
          </nav>

          <div className="px-4 py-4 border-t border-gray-100">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <ShieldAlert size={15} />
                </div>
                <div>
                  <div className="text-xs font-black text-gray-900">HITL 已激活</div>
                  <div className="text-[10px] text-gray-400">安全监控中</div>
                </div>
                <div className="ml-auto w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
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
                  onSave={handleSaveProvider}
                  onTestConnection={handleTestConnection}
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
        </div>
      </div>
    </div>
  )
}
