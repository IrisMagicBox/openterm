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
import { useConfirm } from '../../hooks/useConfirm'
import { Badge, Button, FormField, IconButton, Input, Surface, Switch } from '../ui'

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

export function ProviderSettings({
  provider,
  models,
  onSave,
  onTestConnection,
  onAddModel,
  onRemoveModel
}: ProviderSettingsProps): React.ReactElement {
  const { confirm, ConfirmDialogComponent } = useConfirm()
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
        <Server size={48} className="mb-4 opacity-30" />
        <p>选择提供商以配置其设置</p>
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
      setTestMessage(result.message)
    } catch (error) {
      setTestResult(false)
      setTestMessage(error instanceof Error ? error.message : '连接测试失败')
    } finally {
      setIsTesting(false)
      setTestingModelId(null)
    }
  }

  const providerUrls = PROVIDER_URLS[provider.id as keyof typeof PROVIDER_URLS]
  const modelFetchRequiresApiKey = !['ollama', 'lmstudio'].includes(provider.id)

  return (
    <div className="max-w-2xl p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">{provider.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">类型：{provider.type}</p>
          </div>
          <div className="flex items-center gap-2">
            {testResult !== null && (
              <Badge variant={testResult ? 'success' : 'danger'} title={testMessage}>
                {testResult ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {testResult ? '连接成功' : '连接失败'}
              </Badge>
            )}
            {onTestConnection && (
              <Button
                onClick={() => handleTestConnection()}
                disabled={isTesting || !!testingModelId}
                variant="secondary"
              >
                {isTesting ? (
                  <>
                    <RotateCw size={16} className="animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    测试连接
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {providerUrls?.websites && (
          <div className="mt-3 flex gap-4 text-sm">
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

      <div className="space-y-4">
        <FormField label="显示名称">
          <Input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
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
              className="pr-10"
            />
            <IconButton
              aria-label={showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
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
            placeholder="https://api.example.com"
          />
        </FormField>

        {provider.type === 'azure-openai' && (
          <FormField label="API 版本">
            <Input
              type="text"
              value={formData.apiVersion || ''}
              onChange={(e) => handleChange('apiVersion', e.target.value)}
              placeholder="2024-02-01"
            />
          </FormField>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Switch
            checked={!!formData.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
          <label htmlFor="enabled" className="text-sm font-semibold text-foreground">
            启用此提供商
          </label>
        </div>

        <div className="border-t border-border pt-6 mt-6">
          <div className="flex items-center justify-between mb-4">
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
                    setModelError('自动获取模型失败，请手动添加。')
                  } finally {
                    setIsFetchingModels(false)
                  }
                }}
                disabled={isFetchingModels || (modelFetchRequiresApiKey && !formData.apiKey)}
                className="text-xs text-accent hover:text-accent-strong font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                {isFetchingModels ? '正在获取...' : '自动获取模型'}
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <Input
              type="text"
              placeholder="模型名称 (如: GPT-4o)"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              className="flex-1"
            />
            <Input
              type="text"
              placeholder="模型 ID (如: gpt-4o)"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              className="flex-1"
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
            >
              <Plus size={16} />
              添加
            </Button>
          </div>

          {modelError && (
            <div className="mb-4 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger font-medium">
              {modelError}
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {models.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/70 bg-white/55 py-8 text-center backdrop-blur-xl">
                <p className="text-sm text-muted-foreground">暂无模型，请添加模型</p>
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
                      <div className="font-semibold text-sm text-foreground truncate">
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
                          <RotateCw size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                      {onRemoveModel && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: '删除模型',
                              message: `确定删除模型"${apiModelId}"吗？`,
                              confirmText: '删除',
                              variant: 'danger'
                            })
                            if (!ok) return
                            onRemoveModel(model.providerId, model.id)
                          }}
                          className="p-1.5 text-muted-foreground hover:text-danger hover:bg-danger-soft rounded-md transition-colors"
                          title="删除模型"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </Surface>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty} variant={isDirty ? 'primary' : 'subtle'}>
          <Save size={18} />
          保存更改
        </Button>
      </div>

      {provider.isSystem && (
        <Surface className="mt-6" variant="subtle">
          <p className="text-sm text-muted-foreground">
            这是系统提供商。您可以修改其配置，但无法删除。
            点击提供商列表中的&quot;恢复默认设置&quot;可还原原始设置。
          </p>
        </Surface>
      )}
      {ConfirmDialogComponent}
    </div>
  )
}
