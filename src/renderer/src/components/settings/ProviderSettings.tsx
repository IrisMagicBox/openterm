import { useState, useEffect } from 'react'
import { Eye, EyeOff, Save, Globe, Key, Server, CheckCircle, AlertCircle } from 'lucide-react'
import type { Provider } from '../../../../shared/types'
import { PROVIDER_URLS } from '../../config/providers'

interface ProviderSettingsProps {
  provider: Provider | null
  onSave: (provider: Provider) => void
  onTestConnection?: (provider: Provider) => Promise<boolean>
}

export function ProviderSettings({ provider, onSave, onTestConnection }: ProviderSettingsProps) {
  const [formData, setFormData] = useState<Partial<Provider>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [isDirty, setIsDirty] = useState(false)

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
    }
  }, [provider])

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Server size={48} className="mb-4 opacity-30" />
        <p>Select a provider to configure its settings</p>
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

  const handleTestConnection = async () => {
    if (!onTestConnection) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await onTestConnection({ ...provider, ...formData } as Provider)
      setTestResult(result)
    } catch {
      setTestResult(false)
    } finally {
      setIsTesting(false)
    }
  }

  const providerUrls = PROVIDER_URLS[provider.id as keyof typeof PROVIDER_URLS]

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{provider.name}</h2>
            <p className="text-sm text-gray-500 mt-1">Type: {provider.type}</p>
          </div>
          <div className="flex items-center gap-2">
            {testResult !== null && (
              <div
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                  testResult ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {testResult ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {testResult ? 'Connected' : 'Failed'}
              </div>
            )}
            {onTestConnection && (
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
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
              Official Website
            </a>
            {providerUrls.websites.apiKey && (
              <a
                href={providerUrls.websites.apiKey}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Get API Key
              </a>
            )}
            {providerUrls.websites.docs && (
              <a
                href={providerUrls.websites.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Documentation
              </a>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
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
              API Key
            </span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="Enter your API key"
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
          <p className="mt-1 text-xs text-gray-500">
            Your API key is stored locally and never shared.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-2">
              <Globe size={14} />
              API Host
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
            <label className="block text-sm font-medium text-gray-700 mb-1">API Version</label>
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
          <input
            type="checkbox"
            id="enabled"
            checked={formData.enabled || false}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="enabled" className="text-sm text-gray-700">
            Enable this provider
          </label>
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
          Save Changes
        </button>
      </div>

      {provider.isSystem && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            This is a system provider. You can modify its configuration, but you cannot delete it.
            Click &quot;Reset to Defaults&quot; in the provider list to restore original settings.
          </p>
        </div>
      )}
    </div>
  )
}
