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
import { PROVIDER_URLS } from '../../config/providers'

interface ProviderSettingsProps {
  provider: Provider | null
  models: Model[]
  onSave: (provider: Provider) => void
  onTestConnection?: (provider: Provider, modelId?: string) => Promise<{ ok: boolean; message: string }>
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
}: ProviderSettingsProps) {
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
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Server size={48} className="mb-4 opacity-30" />
        <p>选择提供商以配置其设置</p>
      </div>
    )
  }

  const handleChange = (field: keyof Provider, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
    setTestResult(null)
  }

  const handleSave = () => {
    const updatedProvider = {
      ...provider,
      ...formData,
      updatedAt: Date.now()
    }
    onSave(updatedProvider)
    setIsDirty(false)
  }

  const handleTestConnection = async (modelId?: string) => {
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

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{provider.name}</h2>
            <p className="text-sm text-gray-500 mt-1">类型：{provider.type}</p>
          </div>
          <div className="flex items-center gap-2">
            {testResult !== null && (
              <div
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                  testResult ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
                title={testMessage}
              >
                {testResult ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {testResult ? '连接成功' : '连接失败'}
              </div>
            )}
            {onTestConnection && (
              <button
                onClick={() => handleTestConnection()}
                disabled={isTesting || !!testingModelId}
                className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
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
              </button>
            )}
          </div>
        </div>

        {providerUrls?.websites && (
          <div className="mt-3 flex gap-4 text-sm">
            <a
              href={providerUrls.websites.official}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              官方网站
            </a>
            {providerUrls.websites.apiKey && (
              <a
                href={providerUrls.websites.apiKey}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                获取 API 密钥
              </a>
            )}
            {providerUrls.websites.docs && (
              <a
                href={providerUrls.websites.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                文档
              </a>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-2">
              <Key size={14} />
              API 密钥
            </span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="输入您的 API 密钥"
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">您的 API 密钥仅本地存储，不会共享。</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-2">
              <Globe size={14} />
              API 主机
            </span>
          </label>
          <input
            type="text"
            value={formData.apiHost || ''}
            onChange={(e) => handleChange('apiHost', e.target.value)}
            placeholder="https://api.example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {provider.type === 'azure-openai' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API 版本</label>
            <input
              type="text"
              value={formData.apiVersion || ''}
              onChange={(e) => handleChange('apiVersion', e.target.value)}
              placeholder="2024-02-01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => handleChange('enabled', !formData.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formData.enabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formData.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <label htmlFor="enabled" className="text-sm font-semibold text-gray-700">
            启用此提供商
          </label>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900">模型管理</h3>
            {provider.type === 'openai' && (
              <button
                onClick={async () => {
                  setIsFetchingModels(true)
                  setModelError('')
                  try {
                    // This is a bit of a hack: we use the connection test logic or a dedicated fetch
                    // but for now, let's just use the apiHost/models endpoint
                    const headers: Record<string, string> = {}
                    if (formData.apiKey) headers['Authorization'] = `Bearer ${formData.apiKey}`
                    
                    const url = `${formData.apiHost || ''}/models`
                    const response = await fetch(url, { headers })
                    if (!response.ok) throw new Error(`HTTP ${response.status}`)
                    const data = await response.json()
                    
                    if (data.data && Array.isArray(data.data)) {
                      for (const m of data.data) {
                        const exists = models.find(em => em.id === m.id)
                        if (!exists && onAddModel) {
                          await onAddModel({
                            id: m.id,
                            providerId: provider.id,
                            name: m.id
                          })
                        }
                      }
                    }
                  } catch (err) {
                    setModelError('自动获取模型失败，请手动添加。')
                  } finally {
                    setIsFetchingModels(false)
                  }
                }}
                disabled={isFetchingModels || !formData.apiKey}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 disabled:opacity-50"
              >
                {isFetchingModels ? '正在获取...' : '自动获取模型'}
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="模型名称 (如: GPT-4o)"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-100 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <input
              type="text"
              placeholder="模型 ID (如: gpt-4o)"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-100 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={async () => {
                if (newModelName.trim() && newModelId.trim() && provider) {
                  setModelError('')
                  try {
                    if (onAddModel) {
                      await onAddModel({
                        id: newModelId.trim(),
                        providerId: provider.id,
                        name: newModelName.trim()
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
              className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center gap-1"
            >
              <Plus size={16} />
              添加
            </button>
          </div>

          {modelError && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600 font-medium">
              {modelError}
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {models.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">暂无模型，请添加模型</p>
              </div>
            ) : (
              models.map((model) => (
                <div
                  key={model.id}
                  className="group flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:shadow-sm hover:border-gray-200 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 truncate">{model.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono truncate uppercase tracking-tight">
                      {model.id}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleTestConnection(model.id)}
                      disabled={!!testingModelId}
                      className={`p-1.5 rounded-lg transition-colors ${
                        testingModelId === model.id
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                      title="测试该模型"
                    >
                      {testingModelId === model.id ? (
                        <RotateCw size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    {onRemoveModel && (
                      <button
                        onClick={() => onRemoveModel(model.providerId, model.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除模型"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center gap-2 px-6 py-2 rounded-md font-medium transition-colors ${
            isDirty
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save size={18} />
          保存更改
        </button>
      </div>

      {provider.isSystem && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            这是系统提供商。您可以修改其配置，但无法删除。
            点击提供商列表中的"恢复默认设置"可还原原始设置。
          </p>
        </div>
      )}
    </div>
  )
}
