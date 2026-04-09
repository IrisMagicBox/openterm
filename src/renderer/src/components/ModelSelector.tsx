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
        <span>未启用提供商</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2.5 px-4 py-2 bg-white border rounded-xl text-sm font-semibold transition-all shadow-sm ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-100 bg-gray-50'
            : 'hover:border-blue-300 hover:shadow-md border-gray-200 active:scale-95'
        }`}
      >
        <Cpu size={14} className={selectedProvider ? 'text-blue-600' : 'text-gray-400'} />
        <span className="max-w-[150px] truncate text-gray-700">
          {selectedModel
            ? selectedModel.name
            : selectedProvider
              ? `${selectedProvider.name} (默认)`
              : '选择模型'}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-3 w-80 bg-white border border-gray-100 rounded-3xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-xl">
          <div className="max-h-96 overflow-y-auto scrollbar-hide py-2">
            {enabledProviders.map((provider) => {
              const providerModels = getProviderModels(provider.id)
              return (
                <div key={provider.id} className="mb-2 last:mb-0">
                  <div className="px-4 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      {provider.name}
                    </span>
                    <div className="h-[1px] flex-1 bg-gray-100" />
                  </div>
                  <div className="px-2 space-y-0.5">
                    {providerModels.length > 0 ? (
                      providerModels.map((model) => (
                        <button
                          key={`${provider.id}-${model.id}`}
                          onClick={() => handleSelect(provider.id, model.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-left transition-all ${
                            selectedProviderId === provider.id && selectedModelId === model.id
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${
                             selectedProviderId === provider.id && selectedModelId === model.id
                             ? 'bg-white'
                             : 'bg-transparent'
                          }`} />
                          <span className="truncate flex-1 font-medium">{model.name}</span>
                          {model.group && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                              selectedProviderId === provider.id && selectedModelId === model.id
                              ? 'bg-white/20 text-white'
                              : 'bg-gray-100 text-gray-400'
                            }`}>
                              {model.group}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <button
                        onClick={() => handleSelect(provider.id, 'default')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-left transition-all ${
                          selectedProviderId === provider.id && selectedModelId === null
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${
                           selectedProviderId === provider.id && selectedModelId === null
                           ? 'bg-white'
                           : 'bg-transparent'
                        }`} />
                        <span className="text-inherit opacity-70 italic flex-1 font-medium">默认模型环境</span>
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
