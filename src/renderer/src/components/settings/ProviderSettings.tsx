import { useState, useEffect } from 'react'
import {
  Eye,
  EyeOff,
  Save,
  Globe,
  Key,
  Server,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Play,
  RotateCw
} from 'lucide-react'
import type { Provider, Model } from '../../../../shared/types'
import { PROVIDER_URLS, inferModelCapabilities } from '../../config/providers'
import {
  Badge,
  Button,
  ConfirmActionButton,
  FormField,
  IconButton,
  Input,
  Surface,
  Switch
} from '../ui'

interface ProviderSettingsProps {
  provider: Provider | null
  models: Model[]
  onSave: (provider: Provider) => void
  onTestConnection?: (
    provider: Provider,
    modelId?: string
  ) => Promise<{ ok: boolean; message: string }>
  onAddModel?: (model: Omit<Model, 'createdAt'>) => Promise<Model> | void
  onRemoveModel?: (providerId: string, modelId: string) => Promise<void> | void
}

function describeProviderTestMessage(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('401') || lower.includes('403') || lower.includes('api key')) {
    return `鉴权失败：请检查 API 密钥或服务权限。${message}`
  }
  if (lower.includes('404') || lower.includes('model not found') || lower.includes('not found')) {
    return `模型或接口路径不存在：请检查模型 ID 和 API 主机。${message}`
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('fetch')) {
    return `网络或服务不可达：请检查本机网络、代理和服务地址。${message}`
  }
  if (lower.includes('api host') || lower.includes('base url') || lower.includes('baseurl')) {
    return `API 主机配置可能有误：请确认地址包含正确的版本路径。${message}`
  }
  return message
}

export function ProviderSettings({
  provider,
  models,
  onSave,
  onTestConnection,
  onAddModel,
  onRemoveModel
}: ProviderSettingsProps): React.ReactElement {
  const [formData, setFormData] = useState<Partial<Provider>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelId, setNewModelId] = useState('')
  const [modelError, setModelError] = useState('')
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)

  useEffect(() => {
    if (provider) {
      setFormData({
        name: provider.name,
        apiKey: provider.apiKey,
        apiHost: provider.apiHost,
        apiVersion: provider.apiVersion,
        enabled: provider.enabled
      })
      setIsDirty(false)
      setTestResult(null)
      setTestMessage('')
      setModelError('')
    }
  }, [provider])

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Server size={40} className="mb-3 opacity-30" />
        <p className="text-sm">选择提供商以配置其设置</p>
      </div>
    )
  }

  const handleChange = (field: keyof Provider, value: string | boolean): void => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
    setTestResult(null)
  }

  const handleSave = (): void => {
    const updatedProvider = {
      ...provider,
      ...formData,
      updatedAt: Date.now()
    }
    onSave(updatedProvider)
    setIsDirty(false)
  }

  const handleTestConnection = async (modelId?: string): Promise<void> => {
    if (!onTestConnection) return
    if (modelId) setTestingModelId(modelId)
    else setIsTesting(true)

    setTestResult(null)
    setTestMessage('')
    try {
      const result = await onTestConnection({ ...provider, ...formData } as Provider, modelId)
      setTestResult(result.ok)
      setTestMessage(result.ok ? result.message : describeProviderTestMessage(result.message))
    } catch (error) {
      setTestResult(false)
      const message = error instanceof Error ? error.message : '连接测试失败'
      setTestMessage(describeProviderTestMessage(message))
    } finally {
      setIsTesting(false)
      setTestingModelId(null)
    }
  }

  const providerUrls = PROVIDER_URLS[provider.id as keyof typeof PROVIDER_URLS]
  const modelFetchRequiresApiKey = !['ollama', 'lmstudio'].includes(provider.id)

  return (
    <div className="max-w-2xl p-5">
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{provider.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">类型：{provider.type}</p>
          </div>
          <div className="flex items-center gap-2">
            {testResult !== null && (
              <Badge variant={testResult ? 'success' : 'danger'} title={testMessage}>
                {testResult ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {testResult ? '连接成功' : '连接失败'}
              </Badge>
            )}
            {onTestConnection && (
              <Button
                onClick={() => handleTestConnection()}
                disabled={isTesting || !!testingModelId}
                variant="secondary"
                size="sm"
              >
                {isTesting ? (
                  <>
                    <RotateCw size={14} className="animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    测试连接
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {providerUrls?.websites && (
          <div className="mt-2.5 flex gap-3 text-xs">
            <a
              href={providerUrls.websites.official}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              官方网站
            </a>
            {providerUrls.websites.apiKey && (
              <a
                href={providerUrls.websites.apiKey}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                获取 API 密钥
              </a>
            )}
            {providerUrls.websites.docs && (
              <a
                href={providerUrls.websites.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                文档
              </a>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3.5">
        <FormField label="显示名称">
          <Input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="h-7 text-xs"
          />
        </FormField>

        <FormField
          label={
            <span className="flex items-center gap-2">
              <Key size={14} />
              API 密钥
            </span>
          }
          hint="您的 API 密钥仅本地存储，不会共享。"
        >
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="输入您的 API 密钥"
              className="h-7 pr-10 text-xs"
            />
            <IconButton
              aria-label={showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </IconButton>
          </div>
        </FormField>

        <FormField
          label={
            <span className="flex items-center gap-2">
              <Globe size={14} />
              API 主机
            </span>
          }
        >
          <Input
            type="text"
            value={formData.apiHost || ''}
            onChange={(e) => handleChange('apiHost', e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-7 text-xs"
          />
        </FormField>

        {provider.type === 'azure-openai' && (
          <FormField label="API 版本">
            <Input
              type="text"
              value={formData.apiVersion || ''}
              onChange={(e) => handleChange('apiVersion', e.target.value)}
              placeholder="2024-02-01"
              className="h-7 text-xs"
            />
          </FormField>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <Switch
            checked={!!formData.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
          <label htmlFor="enabled" className="text-xs font-semibold text-foreground">
            启用此提供商
          </label>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">模型管理</h3>
            {!['azure-openai', 'aws-bedrock', 'vertexai', 'custom'].includes(provider.type) && (
              <button
                onClick={async () => {
                  setIsFetchingModels(true)
                  setModelError('')
                  try {
                    const fetchedModels = await window.api.fetchProviderModels({
                      ...provider,
                      ...formData
                    } as Provider)

                    for (const fetchedModel of fetchedModels) {
                      const apiModelId = fetchedModel.providerModelId || fetchedModel.id
                      const exists = models.find(
                        (em) => em.providerModelId === apiModelId || em.id === fetchedModel.id
                      )
                      if (!exists && onAddModel) {
                        await onAddModel(fetchedModel)
                      }
                    }
                  } catch {
                    setModelError('自动获取模型失败，请检查 API 主机、密钥和网络后重试，或手动添加模型。')
                  } finally {
                    setIsFetchingModels(false)
                  }
                }}
                disabled={isFetchingModels || (modelFetchRequiresApiKey && !formData.apiKey)}
                className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong disabled:opacity-50"
              >
                {isFetchingModels ? '正在获取...' : '自动获取模型'}
              </button>
            )}
          </div>

          <div className="mb-3 flex gap-2">
            <Input
              type="text"
              placeholder="模型名称 (如: GPT-4o)"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
            <Input
              type="text"
              placeholder="模型 ID (如: gpt-4o)"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
            <Button
              onClick={async () => {
                if (newModelName.trim() && newModelId.trim() && provider) {
                  const apiModelId = newModelId.trim()
                  setModelError('')
                  try {
                    if (onAddModel) {
                      await onAddModel({
                        id: `${provider.id}:${apiModelId}`,
                        providerId: provider.id,
                        providerModelId: apiModelId,
                        name: newModelName.trim(),
                        capabilities: inferModelCapabilities(apiModelId, provider.id, newModelName)
                      })
                    }
                    setNewModelName('')
                    setNewModelId('')
                  } catch (error) {
                    setModelError(error instanceof Error ? error.message : '添加模型失败')
                  }
                }
              }}
              disabled={!newModelName.trim() || !newModelId.trim()}
              variant="primary"
              size="sm"
            >
              <Plus size={14} />
              添加
            </Button>
          </div>

          {modelError && (
            <div className="mb-3 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {modelError}
            </div>
          )}

          <div className="custom-scrollbar max-h-60 space-y-1.5 overflow-y-auto pr-2">
            {models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/70 bg-white/55 py-6 text-center">
                <p className="text-xs text-muted-foreground">暂无模型。可以自动获取，或手动添加模型 ID。</p>
              </div>
            ) : (
              models.map((model) => {
                const apiModelId = model.providerModelId || model.id
                return (
                  <Surface
                    key={model.id}
                    padding="sm"
                    className="group flex items-center justify-between hover:border-accent/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {model.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {apiModelId}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleTestConnection(apiModelId)}
                        disabled={!!testingModelId}
                        className={`p-1.5 rounded-md transition-colors ${
                          testingModelId === apiModelId
                            ? 'text-accent bg-accent-soft'
                            : 'text-muted-foreground hover:text-accent hover:bg-accent-soft'
                        }`}
                        title="测试该模型"
                      >
                        {testingModelId === apiModelId ? (
                          <RotateCw size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>
                      {onRemoveModel && (
                        <ConfirmActionButton
                          aria-label={`删除模型 ${apiModelId}`}
                          onConfirm={() => {
                            onRemoveModel(model.providerId, model.id)
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
                          confirmClassName="hover:bg-danger-strong"
                          confirmingTitle={`删除 ${apiModelId}`}
                          title="删除模型"
                        >
                          <Trash2 size={13} />
                        </ConfirmActionButton>
                      )}
                    </div>
                  </Surface>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!isDirty}
          variant={isDirty ? 'primary' : 'subtle'}
          size="sm"
        >
          <Save size={14} />
          保存更改
        </Button>
      </div>

      {provider.isSystem && (
        <Surface className="mt-5" padding="sm" variant="subtle">
          <p className="text-xs leading-5 text-muted-foreground">
            这是系统提供商。您可以修改其配置，但无法删除。
            点击提供商列表中的“恢复默认设置”可还原原始设置。
          </p>
        </Surface>
      )}
    </div>
  )
}
