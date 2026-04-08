import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu, Check } from 'lucide-react'
import type { Provider, Model } from '../../../shared/types'

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
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const enabledProviders = providers.filter((p) => p.enabled)

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const selectedModel = models.find(
    (m) => m.id === selectedModelId && m.providerId === selectedProviderId
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (providerId: string, modelId: string) => {
    onSelect(providerId, modelId)
    setIsOpen(false)
  }

  const getProviderModels = (providerId: string) => {
    return models.filter((m) => m.providerId === providerId)
  }

  if (enabledProviders.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm">
        <Cpu size={14} />
        <span>No providers enabled</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200'
            : 'hover:border-blue-300 border-gray-200'
        }`}
      >
        <Cpu size={14} className={selectedProvider ? 'text-blue-500' : 'text-gray-400'} />
        <span className="max-w-[150px] truncate">
          {selectedModel
            ? selectedModel.name
            : selectedProvider
              ? `${selectedProvider.name} (default)`
              : 'Select Model'}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="max-h-80 overflow-y-auto">
            {enabledProviders.map((provider) => {
              const providerModels = getProviderModels(provider.id)
              return (
                <div key={provider.id}>
                  <div className="px-3 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {provider.name}
                  </div>
                  {providerModels.length > 0 ? (
                    providerModels.map((model) => (
                      <button
                        key={`${provider.id}-${model.id}`}
                        onClick={() => handleSelect(provider.id, model.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors ${
                          selectedProviderId === provider.id && selectedModelId === model.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {selectedProviderId === provider.id && selectedModelId === model.id && (
                          <Check size={14} className="text-blue-500" />
                        )}
                        <span className="truncate">{model.name}</span>
                        {model.group && (
                          <span className="ml-auto text-xs text-gray-400">{model.group}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={() => handleSelect(provider.id, 'default')}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors ${
                        selectedProviderId === provider.id && selectedModelId === null
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700'
                      }`}
                    >
                      {selectedProviderId === provider.id && selectedModelId === null && (
                        <Check size={14} className="text-blue-500" />
                      )}
                      <span className="text-gray-500 italic">Default model</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
