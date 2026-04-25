import { useState } from 'react'
import { Cloud, Server, Cpu, ToggleLeft, ToggleRight, Plus, Trash2, RefreshCw } from 'lucide-react'
import type { Provider } from '../../../../shared/types'
import { Badge, ConfirmActionButton, IconButton, Input } from '../ui'
import { cn } from '../../lib/utils'

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

function getProviderIcon(provider: Provider): React.ReactNode {
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
}: ProviderListProps): React.ReactElement {
  const [filter, setFilter] = useState('')

  const filteredProviders = providers.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  )

  const enabledCount = providers.filter((p) => p.enabled).length

  return (
    <div className="glass-sidebar glass-sidebar-joined flex h-full w-72 flex-col border-y-0 border-l-0">
      <div className="border-b border-white/55 bg-white/35 p-4 backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">AI 提供商</h2>
          <Badge variant="neutral">
            {enabledCount}/{providers.length} 已启用
          </Badge>
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="筛选提供商..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1"
          />
          <IconButton aria-label="添加自定义提供商" onClick={onAddProvider} variant="primary">
            <Plus size={18} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredProviders.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">未找到提供商</div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  selectedProviderId === provider.id
                    ? 'border-white/65 bg-black/5 shadow-sm'
                    : 'border-transparent hover:border-white/75 hover:bg-white/60'
                }`}
                onClick={() => onSelectProvider(provider)}
              >
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                    provider.enabled
                      ? 'bg-accent-soft text-accent'
                      : 'bg-surface-muted text-muted-foreground'
                  )}
                >
                  {getProviderIcon(provider)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">
                    {provider.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{provider.type}</div>
                </div>

                <div className="flex items-center gap-1">
                  {provider.isSystem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onResetProvider(provider.id)
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="恢复默认设置"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}

                  {!provider.isSystem && (
                    <ConfirmActionButton
                      aria-label={`删除提供商 ${provider.name}`}
                      onConfirm={() => {
                        onDeleteProvider(provider.id)
                      }}
                      stopPropagation
                      className="p-1.5 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      confirmClassName="opacity-100 hover:bg-danger-strong"
                      confirmingTitle={`删除 ${provider.name}`}
                      title="删除提供商"
                    >
                      <Trash2 size={14} />
                    </ConfirmActionButton>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleEnabled(provider.id, !provider.enabled)
                    }}
                    className={`p-1 transition-colors ${
                      provider.enabled ? 'text-accent' : 'text-muted-foreground'
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

      <div className="border-t border-white/55 bg-white/35 p-3 text-xs text-muted-foreground backdrop-blur-2xl">
        点击提供商以配置其设置
      </div>
    </div>
  )
}
