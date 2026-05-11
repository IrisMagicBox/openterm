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
  openai: <Cloud size={15} />,
  anthropic: <Cloud size={15} />,
  gemini: <Cloud size={15} />,
  'azure-openai': <Cloud size={15} />,
  ollama: <Server size={15} />,
  lmstudio: <Server size={15} />,
  deepseek: <Cpu size={15} />,
  silicon: <Cpu size={15} />,
  minimax: <Cpu size={15} />,
  groq: <Cpu size={15} />,
  mistral: <Cloud size={15} />,
  together: <Cloud size={15} />,
  fireworks: <Cloud size={15} />,
  nvidia: <Cpu size={15} />,
  grok: <Cloud size={15} />,
  'aws-bedrock': <Cloud size={15} />,
  vertexai: <Cloud size={15} />,
  github: <Cloud size={15} />,
  copilot: <Cloud size={15} />,
  openrouter: <Cloud size={15} />,
  coreshub: <Cpu size={15} />
}

function getProviderIcon(provider: Provider): React.ReactNode {
  return providerIcons[provider.id] || <Cloud size={15} />
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
    <div className="settings-sidebar-surface flex h-full w-64 flex-col">
      <div className="border-b border-white/55 bg-white/35 p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">AI 提供商</h2>
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
            className="h-7 flex-1 text-xs"
          />
          <IconButton aria-label="添加自定义提供商" onClick={onAddProvider} variant="primary">
            <Plus size={15} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredProviders.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">未找到提供商</div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className={`group flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                  selectedProviderId === provider.id
                    ? 'border-white/65 bg-black/5 shadow-sm'
                    : 'border-transparent hover:border-white/75 hover:bg-white/60'
                }`}
                onClick={() => onSelectProvider(provider)}
              >
                <div
                  className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                    provider.enabled
                      ? 'bg-accent-soft text-accent'
                      : 'bg-surface-muted text-muted-foreground'
                  )}
                >
                  {getProviderIcon(provider)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">
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
                      className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      title="恢复默认设置"
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}

                  {!provider.isSystem && (
                    <ConfirmActionButton
                      aria-label={`删除提供商 ${provider.name}`}
                      onConfirm={() => {
                        onDeleteProvider(provider.id)
                      }}
                      stopPropagation
                      className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      confirmClassName="opacity-100 hover:bg-danger-strong"
                      confirmingTitle={`删除 ${provider.name}`}
                      title="删除提供商"
                    >
                      <Trash2 size={13} />
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
                    {provider.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/55 bg-white/35 p-2.5 text-xs text-muted-foreground">
        点击提供商以配置其设置
      </div>
    </div>
  )
}
