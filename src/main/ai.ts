import OpenAI from 'openai'
import { providerDB, modelDB } from './db'
import type { Provider } from '../shared/types'
import { DEFAULT_MODEL } from '../shared/constants'
import { PROVIDER_CONNECTION_TIMEOUT_MS } from './constants'
import { getErrorMessage } from '../shared/errors'

let cachedClient: OpenAI | null = null
let cachedConfig = ''

export const normalizeProviderApiHost = (provider: Pick<Provider, 'apiHost' | 'type'>): string => {
  const trimmedHost = provider.apiHost.trim().replace(/\/+$/, '')
  if (!trimmedHost) return trimmedHost

  if (
    provider.type === 'openai' &&
    !trimmedHost.endsWith('/v1') &&
    !trimmedHost.includes('/api/v1') &&
    !trimmedHost.endsWith('/openai')
  ) {
    return `${trimmedHost}/v1`
  }

  if (provider.type === 'azure-openai') {
    return trimmedHost
  }

  return trimmedHost
}

export const buildProviderModelsUrl = (provider: Pick<Provider, 'apiHost' | 'type'>): string => {
  const normalizedHost = normalizeProviderApiHost(provider)
  if (!normalizedHost) return normalizedHost

  if (provider.type === 'ollama') {
    return `${normalizedHost}/api/tags`
  }

  if (provider.type === 'azure-openai') {
    return normalizedHost
  }

  if (normalizedHost.endsWith('/models') || normalizedHost.endsWith('/api/tags')) {
    return normalizedHost
  }

  return `${normalizedHost}/models`
}

export const buildProviderChatUrl = (provider: Pick<Provider, 'apiHost' | 'type'>): string => {
  const normalizedHost = normalizeProviderApiHost(provider)
  if (!normalizedHost) return normalizedHost

  if (provider.type === 'anthropic') {
    return `${normalizedHost}/v1/messages`
  }

  if (provider.type === 'gemini') {
    return normalizedHost // Gemini uses a different pattern with model ID in URL
  }

  if (normalizedHost.endsWith('/chat/completions')) {
    return normalizedHost
  }

  return `${normalizedHost}/chat/completions`
}

export const getAIClient = (): OpenAI => {
  const providers = providerDB.getProviders()
  const enabledProviders = providers.filter((p) => p.enabled)

  if (enabledProviders.length === 0) {
    throw new Error('No AI providers enabled. Please enable a provider in Settings.')
  }

  const provider = enabledProviders[0]
  const normalizedHost = normalizeProviderApiHost(provider)
  const configKey = `${normalizedHost}:${provider.apiKey}`

  if (!cachedClient || cachedConfig !== configKey) {
    cachedClient = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: normalizedHost
    })
    cachedConfig = configKey
  }

  return cachedClient
}

export const getCurrentModel = (): string => {
  const providers = providerDB.getProviders()
  const enabledProviders = providers.filter((p) => p.enabled)

  if (enabledProviders.length === 0) {
    return DEFAULT_MODEL
  }

  const provider = enabledProviders[0]
  const models = modelDB.getModels(provider.id)

  if (models.length > 0) {
    return models[0].id
  }

  return 'default'
}

export const getEnabledProviders = () => {
  const providers = providerDB.getProviders()
  return providers.filter((p) => p.enabled)
}

export const SYSTEM_PROMPT = `你是 OpenTerm Agent，一个专为 macOS 设计的、具备高度自主推理能力的 SSH 终端助手。

你的目标是协助用户高效、可靠地管理远程基础设施。

### 核心思维模型：深度 ReAct-Verify
你必须严格遵循以下步骤循环，并在每一步的 "thought" 字段中显式记录：
1. **分析 (Analyze)**：深入分析用户意图和当前环境（主机、终端、历史记录）。
2. **计划 (Plan)**：制定 1-3 步的小型计划。
3. **行动 (Action)**：调用工具执行操作。
4. **观察 (Observe)**：获取工具返回的提纯事实。
5. **验证 (Verify)**：**[关键步骤]** 每次执行完修改类操作或在决定结束任务前，必须主动通过只读命令（如 status, check, curl 等）验证任务是否真正达成。
6. **产出 (Conclude)**：给出明确的、基于验证事实的最终报告。

### 规则与准则：
- **始终使用中文回复**。
- **验证先行**：禁止仅凭命令退出码为 0 就断定任务成功。你必须有证据（如端口在监听、文件内容已改变、服务 PID 已更新）。
- **自主环境管理**：如果当前终端被占用或需要跨主机操作，主动使用 \`manage_terminal\`。
- **记忆与检索**：利用 \`search_memory\` 获取历史习惯，利用 \`read_file\` 获取复杂配置。
- **失败恢复**：如果命令执行失败，在 Thought 中分析原因并尝试替代方案（Retry/Re-plan），不要轻易放弃。

### 最终报告要求：
你的最终回答必须包含：
1. **完成状态**：明确说明目标是否达成。
2. **验证证据**：列出你用来确认成功的具体观察结果。
3. **任何残留风险或后续建议**。

---
[环境上下文随每轮自动注入，请重点关注最近的终端状态反馈]
`

export async function testProviderConnection(
  provider: Provider,
  modelId?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const chatUrl = buildProviderChatUrl(provider)
    if (!chatUrl) return { ok: false, message: 'API Host is required.' }

    // Get model to test
    const models = modelDB.getModels(provider.id)
    let testModel = modelId || (models.length > 0 ? models[0].id : '')

    if (!testModel) {
      // Fallback defaults for testing if no models configured
      if (provider.id === 'openai' || provider.type === 'openai') testModel = 'gpt-4o-mini'
      else if (provider.id === 'anthropic' || provider.type === 'anthropic')
        testModel = 'claude-3-haiku-20240307'
      else if (provider.id === 'deepseek') testModel = 'deepseek-chat'
      else if (provider.id === 'groq') testModel = 'llama3-8b-8192'
    }

    if (!testModel && provider.type !== 'gemini') {
      return { ok: false, message: '请先在该提供商下添加至少一个模型以进行对话测试。' }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    let body: any = {}

    if (provider.type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey || ''
      headers['anthropic-version'] = '2023-06-01'
      body = {
        model: testModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }
    } else if (provider.type === 'gemini') {
      // Gemini specific quick test
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${provider.apiKey || ''}`
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      })
      const data: any = await response.json()
      if (data.error) return { ok: false, message: data.error.message || 'Gemini API Error' }
      return {
        ok: response.ok,
        message: response.ok ? 'Connection successful.' : `HTTP ${response.status}`
      }
    } else {
      // OpenAI format (default)
      if (provider.apiKey) {
        headers.Authorization = `Bearer ${provider.apiKey}`
      }
      body = {
        model: testModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_CONNECTION_TIMEOUT_MS)

    try {
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data: any = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorMsg = data.error?.message || data.error || response.statusText
        return { ok: false, message: `HTTP ${response.status}: ${errorMsg}` }
      }

      if (data.error) {
        return { ok: false, message: data.error.message || 'API error' }
      }

      return { ok: true, message: `连接成功！已通过模型 ${testModel} 完成对话测试。` }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          ok: false,
          message: `连接超时（${PROVIDER_CONNECTION_TIMEOUT_MS / 1000}秒）。这可能是因为 API 地址不通或模型响应过慢。`
        }
      }
      throw error
    }
  } catch (error: unknown) {
    return {
      ok: false,
      message: getErrorMessage(error)
    }
  }
}
