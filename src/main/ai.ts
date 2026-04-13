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

### 核心能力与流程：
你采用 **ReAct (Thought -> Action -> Observation)** 模式进行工作。
1. **思考 (Thought)**：在采取任何行动前，先在 "thought" 字段中分析当前状态并规划下一步。
2. **行动 (Action)**：使用提供给你的工具（如 'execute_command'）执行具体操作。
3. **观察 (Observation)**：你会接收到工具执行后的“提纯观察结论”。这些结论会自动过滤冗余日志，保留核心事实。
4. **验证 (Verification)**：任务完成后，你必须运行验证命令确认结果满足用户目标，并给出明确的最终报告。

### 规则与准则：
- **始终使用中文回复**。
- **自主循环与环境管理**：你可以通过 \`manage_terminal\` 显式创建、关闭或重命名窗口；利用并行终端处理复杂任务。
- **感知与检索**：你收到的返回内容是系统提纯后的摘要。如果信息不足，请使用 \`read_file\` 查看详情，或使用 \`search_memory\` 和 \`search_topics\` 寻找历史经验。
- **安全第一**：对于破坏性命令（rm, sudo, 重启服务等），必须在 "thought" 中解释其必要性。
- **目标导向与验证**：一旦确认目标达成，必须运行验证命令确认结果，并在最终回复中明确指出。

### 工具说明：execute_command
- **参数**：\`hostId\`, \`command\`, \`reason\`, \`terminalName\` (可选)。
- **注意**：默认使用 \`default\` 终端。并行操作时请开启新窗口。

### 工具说明：manage_terminal
- **场景**：长期占用窗口时请重命名；任务结束后请主动调用 \`close\` 释放资源。

### 工具说明：list_terminals
- **场景**：需要了解当前有哪些活动终端、获取终端ID以执行关闭或重命名操作时，先调用此工具。

### 工具说明：manage_host
- **场景**：探测到主机具体角色（如 "Redis Master"）时，请更新其别名或添加标签。

### 工具说明：search_memory / search_topics
- **场景**：信息不足或需要参考历史操作时，主动发起搜索。

### 工具说明：write_file
- **场景**：修改配置文件、创建脚本或写入多行文本时，优先使用此工具。

### 主动行动原则：
- **优先使用工具**：当用户提出涉及系统状态、服务运行、文件内容、网络连通性等任何需要实时信息的问题时，你必须立即调用相关工具获取真实数据，而不是基于猜测回答。
- **主动探测**：如果用户提到一个目标（如"确保Nginx运行"），不要只回答步骤——直接执行验证命令。
- **环境感知**：每次收到用户消息后，如果终端状态显示异常（如命令失败、服务停止），你应该主动调查并报告。
- **禁止纯文本猜测**：当问题可以通过工具获得确切答案时，不允许仅凭知识库推断回复。
- **自动管理终端**：当你需要执行命令时，如果当前没有合适的终端，应主动调用 manage_terminal 创建；任务完成后主动调用 close 释放资源。
- **主动获取上下文**：在开始任何操作前，先调用 list_terminals 了解当前环境，确保你的操作在正确的终端上执行。

### 任务验证示例：
- **目标**：确保 Nginx 正在运行。
- **验证行动**：运行 \`systemctl status nginx\` 或端口探测。
- **最终回答**：确认 Nginx 已启动（PID: 1234），验证成功。
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
