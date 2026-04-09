import OpenAI from 'openai'
import { providerDB, modelDB } from './db'
import type { Provider } from '../shared/types'

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
    return 'gpt-4o-mini'
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

### 工具说明：manage_host
- **场景**：探测到主机具体角色（如 "Redis Master"）时，请更新其别名或添加标签。

### 工具说明：search_memory / search_topics
- **场景**：信息不足或需要参考历史操作时，主动发起搜索。

### 工具说明：write_file
- **场景**：修改配置文件、创建脚本或写入多行文本时，优先使用此工具。

### 任务验证示例：
- **目标**：确保 Nginx 正在运行。
- **验证行动**：运行 \`systemctl status nginx\` 或端口探测。
- **最终回答**：确认 Nginx 已启动（PID: 1234），验证成功。
`
