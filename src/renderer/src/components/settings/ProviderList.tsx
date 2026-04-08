import { useState } from 'react'
import { Cloud, Server, Cpu, ToggleLeft, ToggleRight, Plus, Trash2, RefreshCw } from 'lucide-react'
import type { Provider } from '../../../../shared/types'

interface ProviderListProps {
  providers: Provider[]
  selectedProviderId: string | null
  onSelectProvider: (provider: Provider) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  onAddProvider: () => void
  onDeleteProvider: (id: string) => void
  onResetProvider: (id: string) => void
}

const providerIcons: Record<string, React.ReactNode> = {
  openai: <Cloud size={18} />,
  anthropic: <Cloud size={18} />,
  gemini: <Cloud size={18} />,
  'azure-openai': <Cloud size={18} />,
  ollama: <Server size={18} />,
  lmstudio: <Server size={18} />,
  deepseek: <Cpu size={18} />,
  silicon: <Cpu size={18} />,
  minimax: <Cpu size={18} />,
  groq: <Cpu size={18} />,
  mistral: <Cloud size={18} />,
  together: <Cloud size={18} />,
  fireworks: <Cloud size={18} />,
  nvidia: <Cpu size={18} />,
  grok: <Cloud size={18} />,
  'aws-bedrock': <Cloud size={18} />,
  vertexai: <Cloud size={18} />,
  github: <Cloud size={18} />,
  copilot: <Cloud size={18} />,
  openrouter: <Cloud size={18} />,
  coreshub: <Cpu size={18} />
}

function getProviderIcon(provider: Provider) {
  return providerIcons[provider.id] || <Cloud size={18} />
}

export function ProviderList({
  providers,
  selectedProviderId,
  onSelectProvider,
  onToggleEnabled,
  onAddProvider,
  onDeleteProvider,
  onResetProvider
}: ProviderListProps) {
  const [filter, setFilter] = useState('')

  const filteredProviders = providers.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  )

  const enabledCount = providers.filter((p) => p.enabled).length

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 w-72">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">AI 提供商</h2>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {enabledCount}/{providers.length} 已启用
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="筛选提供商..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onAddProvider}
            className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            title="添加自定义提供商"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredProviders.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">未找到提供商</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className={`group flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                  selectedProviderId === provider.id
                    ? 'bg-blue-50 border-l-3 border-blue-500'
                    : 'hover:bg-gray-100 border-l-3 border-transparent'
                }`}
                onClick={() => onSelectProvider(provider)}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    provider.enabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {getProviderIcon(provider)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{provider.name}</div>
                  <div className="text-xs text-gray-500 truncate">{provider.type}</div>
                </div>

                <div className="flex items-center gap-1">
                  {provider.isSystem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onResetProvider(provider.id)
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="恢复默认设置"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}

                  {!provider.isSystem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteProvider(provider.id)
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除提供商"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleEnabled(provider.id, !provider.enabled)
                    }}
                    className={`p-1 transition-colors ${
                      provider.enabled ? 'text-blue-600' : 'text-gray-400'
                    }`}
                    title={provider.enabled ? '禁用提供商' : '启用提供商'}
                  >
                    {provider.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 bg-white text-xs text-gray-500">
        点击提供商以配置其设置
      </div>
    </div>
  )
}
