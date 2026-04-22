import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'
import type { Provider, Model } from '../../../shared/types'
import { isAgentRuntimeProvider, isAgentUsableModel } from '../config/providers'
import { Badge, Button } from './ui'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  providers: Provider[]
  models: Model[]
  selectedProviderId: string | null
  selectedModelId: string | null
  onSelect: (providerId: string, modelId: string) => void
  disabled?: boolean
}

export function ModelSelector({
  providers,
  models,
  selectedProviderId,
  selectedModelId,
  onSelect,
  disabled = false
}: ModelSelectorProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const enabledProviders = providers.filter((p) => p.enabled && isAgentRuntimeProvider(p))

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const selectedModel = models.find(
    (m) => m.id === selectedModelId && m.providerId === selectedProviderId
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (providerId: string, modelId: string): void => {
    onSelect(providerId, modelId)
    setIsOpen(false)
  }

  const getProviderModels = (providerId: string): Model[] => {
    return models.filter((m) => m.providerId === providerId && isAgentUsableModel(m))
  }

  if (enabledProviders.length === 0) {
    return (
      <Badge variant="neutral">
        <Cpu size={14} />
        <span>未启用提供商</span>
      </Badge>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        variant="secondary"
      >
        <Cpu size={14} className={selectedProvider ? 'text-accent' : 'text-muted-foreground'} />
        <span className="max-w-[150px] truncate">
          {selectedModel
            ? selectedModel.name
            : selectedProvider
              ? `${selectedProvider.name} (默认)`
              : '选择模型'}
        </span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </Button>

      {isOpen && (
        <div className="glass-menu absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl animate-in fade-in">
          <div className="max-h-96 overflow-y-auto py-2">
            {enabledProviders.map((provider) => {
              const providerModels = getProviderModels(provider.id)
              return (
                <div key={provider.id} className="mb-2 last:mb-0">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {provider.name}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="px-2 space-y-0.5">
                    {providerModels.length > 0 ? (
                      providerModels.map((model) => (
                        <button
                          key={`${provider.id}-${model.id}`}
                          onClick={() => handleSelect(provider.id, model.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-all',
                            selectedProviderId === provider.id && selectedModelId === model.id
                              ? 'border-white/65 bg-black/5 text-foreground shadow-sm'
                              : 'border-transparent text-muted-foreground hover:border-white/60 hover:bg-white/60 hover:text-foreground'
                          )}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              selectedProviderId === provider.id && selectedModelId === model.id
                                ? 'bg-accent'
                                : 'bg-border'
                            }`}
                          />
                          <span className="truncate flex-1 font-medium">{model.name}</span>
                          {model.group && (
                            <span
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
                                selectedProviderId === provider.id && selectedModelId === model.id
                                  ? 'border border-white/60 bg-white/65 text-accent'
                                  : 'bg-white/60 text-muted-foreground'
                              }`}
                            >
                              {model.group}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <button
                        onClick={() => handleSelect(provider.id, 'default')}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-all',
                          selectedProviderId === provider.id && selectedModelId === null
                            ? 'border-white/65 bg-black/5 text-foreground shadow-sm'
                            : 'border-transparent text-muted-foreground hover:border-white/60 hover:bg-white/60 hover:text-foreground'
                        )}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            selectedProviderId === provider.id && selectedModelId === null
                              ? 'bg-accent'
                              : 'bg-transparent'
                          }`}
                        />
                        <span className="text-inherit opacity-70 italic flex-1 font-medium">
                          默认模型环境
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
