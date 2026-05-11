import { useMemo, useState } from 'react'
import { Check, ChevronDown, Cpu } from 'lucide-react'
import type { Provider, Model } from '../../../shared/types'
import { isAgentRuntimeProvider, isAgentUsableModel } from '../config/providers'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  type ButtonProps
} from './ui'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  providers: Provider[]
  models: Model[]
  selectedProviderId: string | null
  selectedModelId: string | null
  onSelect: (providerId: string, modelId: string) => void
  disabled?: boolean
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  triggerClassName?: string
  menuAlign?: 'start' | 'center' | 'end'
}

export function ModelSelector({
  providers,
  models,
  selectedProviderId,
  selectedModelId,
  onSelect,
  disabled = false,
  triggerVariant = 'secondary',
  triggerSize = 'md',
  triggerClassName,
  menuAlign = 'end'
}: ModelSelectorProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)

  const enabledProviders = providers.filter((p) => p.enabled && isAgentRuntimeProvider(p))

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const selectedModel = models.find(
    (m) => m.id === selectedModelId && m.providerId === selectedProviderId
  )

  const handleSelect = (providerId: string, modelId: string): void => {
    onSelect(providerId, modelId)
    setIsOpen(false)
  }

  const getProviderModels = (providerId: string): Model[] => {
    return models.filter((m) => m.providerId === providerId && isAgentUsableModel(m))
  }

  const entries = useMemo(
    () =>
      enabledProviders.flatMap((provider) => {
        const providerModels = getProviderModels(provider.id)
        return providerModels.length > 0
          ? providerModels.map((model) => ({ provider, model }))
          : [{ provider, model: null as Model | null }]
      }),
    [enabledProviders, models]
  )

  const showProviderTag = enabledProviders.length > 1

  if (enabledProviders.length === 0) {
    return (
      <Badge variant="neutral">
        <Cpu size={14} />
        <span>未启用提供商</span>
      </Badge>
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={disabled}
          variant={triggerVariant}
          size={triggerSize}
          className={cn(
            'max-w-full justify-start gap-1.5 rounded-full border border-black/[0.06] bg-black/[0.035] px-3 text-[13px] font-medium text-black/60 shadow-none hover:border-black/[0.08] hover:bg-black/[0.05] hover:text-foreground',
            triggerClassName
          )}
        >
          <Cpu
            size={13}
            className={selectedProvider ? 'text-foreground/60' : 'text-muted-foreground'}
          />
          <span className="max-w-[150px] truncate">
            {selectedModel
              ? selectedModel.name
              : selectedProvider
                ? `${selectedProvider.name} (默认)`
                : '选择模型'}
          </span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-[var(--motion-duration-medium)] ease-[var(--motion-ease-emphasized)] ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={menuAlign}
        sideOffset={10}
        className="z-[500] w-[320px] overflow-hidden rounded-[24px] border border-black/[0.08] bg-white/98 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.1)]"
      >
        <div className="px-3 pb-2 pt-1 text-xs font-semibold tracking-wide text-muted-foreground">
          模型
        </div>
        <div className="max-h-96 overflow-y-auto px-1 pb-1">
          {entries.map(({ provider, model }) => {
            const isSelected =
              selectedProviderId === provider.id &&
              ((model && selectedModelId === model.id) || (!model && selectedModelId === null))
            return (
              <button
                key={`${provider.id}-${model?.id ?? 'default'}`}
                onClick={() => handleSelect(provider.id, model?.id ?? 'default')}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-interactive)]',
                  isSelected
                    ? 'bg-black/[0.05] text-foreground'
                    : 'text-foreground/88 hover:bg-black/[0.035]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium leading-6">
                    {model?.name ?? `${provider.name} 默认`}
                  </div>
                  {showProviderTag && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{provider.name}</div>
                  )}
                </div>
                {isSelected ? <Check size={18} className="shrink-0 text-foreground" /> : null}
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
