import OpenAI from 'openai'
import { providerDB, modelDB, topicDB } from './db'
import type { Model, Provider } from '../shared/types'
import { DEFAULT_MODEL } from '../shared/constants'
import { PROVIDER_CONNECTION_TIMEOUT_MS } from './constants'
import { getErrorMessage } from '../shared/errors'
import {
  getModelApiId,
  getSystemModels,
  inferModelCapabilities,
  inferModelRuntimeCapabilities,
  isAgentRuntimeProvider,
  isAgentUsableModel,
  type ModelCapabilities
} from '../shared/provider-presets'

let cachedClient: OpenAI | null = null
let cachedConfig = ''

type ProviderUrlInput = Pick<Provider, 'apiHost' | 'type'> & Partial<Pick<Provider, 'id'>>

export interface ProviderSelectionOptions {
  topicId?: string
  providerId?: string | null
  modelId?: string | null
}

export interface ProviderSelection {
  provider: Provider
  model?: Model
  modelId: string
  modelRecordId?: string
  capabilities: ModelCapabilities
}

const OPENAI_HOST_WITHOUT_V1_PROVIDER_IDS = new Set(['github', 'copilot'])

function hasVersionPath(url: string): boolean {
  return /\/v\d+(?:\/|$)/.test(url)
}

export const normalizeProviderApiHost = (provider: ProviderUrlInput): string => {
  const trimmedHost = provider.apiHost.trim().replace(/\/+$/, '')
  if (!trimmedHost) return trimmedHost

  if (provider.type === 'ollama') {
    return hasVersionPath(trimmedHost) ? trimmedHost : `${trimmedHost}/v1`
  }

  if (provider.type === 'openai' && !hasVersionPath(trimmedHost)) {
    if (provider.id && OPENAI_HOST_WITHOUT_V1_PROVIDER_IDS.has(provider.id)) return trimmedHost
    return `${trimmedHost}/v1`
  }

  if (provider.type === 'azure-openai') {
    return trimmedHost
  }

  return trimmedHost
}

export const buildProviderModelsUrl = (provider: ProviderUrlInput): string => {
  const rawHost = provider.apiHost.trim().replace(/\/+$/, '')
  if (!rawHost) return rawHost

  if (provider.type === 'ollama') {
    return `${rawHost}/api/tags`
  }

  if (provider.type === 'gemini') {
    return `${rawHost}/v1beta/models`
  }

  const normalizedHost = normalizeProviderApiHost(provider)
  if (!normalizedHost) return normalizedHost

  if (provider.type === 'anthropic') {
    return `${normalizedHost}/v1/models`
  }

  if (provider.type === 'azure-openai') {
    return normalizedHost
  }

  if (normalizedHost.endsWith('/models') || normalizedHost.endsWith('/api/tags')) {
    return normalizedHost
  }

  return `${normalizedHost}/models`
}

export const buildProviderChatUrl = (provider: ProviderUrlInput): string => {
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

function getModelsWithPresets(providerId: string): Model[] {
  const byId = new Map<string, Model>()
  for (const preset of getSystemModels(providerId)) {
    byId.set(preset.id, preset)
  }

  for (const model of modelDB.getModels(providerId)) {
    const apiModelId = model.providerModelId || getModelApiId(model)
    const preset = byId.get(model.id)
    byId.set(model.id, {
      ...preset,
      ...model,
      providerModelId: apiModelId,
      capabilities:
        model.capabilities && model.capabilities.length > 0
          ? model.capabilities
          : preset?.capabilities || inferModelCapabilities(apiModelId, providerId, model.name)
    })
  }

  return Array.from(byId.values())
}

export function resolveProviderSelection(
  options: ProviderSelectionOptions = {}
): ProviderSelection {
  const providers = providerDB.getProviders()
  const enabledProviders = providers.filter((p) => p.enabled && isAgentRuntimeProvider(p))

  if (enabledProviders.length === 0) {
    throw new Error(
      'No supported AI providers enabled. Please enable an OpenAI-compatible or Anthropic provider in Settings.'
    )
  }

  const topic = options.topicId ? topicDB.getTopicById(options.topicId) : undefined
  const requestedProviderId = options.providerId || topic?.selectedProviderId
  const provider =
    (requestedProviderId && enabledProviders.find((p) => p.id === requestedProviderId)) ||
    enabledProviders[0]
  const models = getModelsWithPresets(provider.id).filter(isAgentUsableModel)
  const requestedModelId = options.modelId || topic?.selectedModelId
  const model =
    (requestedModelId &&
      models.find((m) => m.id === requestedModelId || m.providerModelId === requestedModelId)) ||
    models[0]
  if (!model && provider.id === 'coreshub') {
    throw new Error('CoresHub 尚未配置模型。请先自动获取模型或手动添加模型。')
  }
  const modelId = model ? getModelApiId(model) : DEFAULT_MODEL
  const capabilities = inferModelRuntimeCapabilities(
    modelId,
    provider.id,
    model?.name ?? modelId,
    model?.capabilities
  )

  return {
    provider,
    model,
    modelId,
    modelRecordId: model?.id,
    capabilities
  }
}

export const getAIClient = (options: ProviderSelectionOptions = {}): OpenAI => {
  const { provider } = resolveProviderSelection(options)
  if (provider.type === 'anthropic') {
    throw new Error('Anthropic uses the Messages API and cannot be called with the OpenAI client.')
  }

  const normalizedHost = normalizeProviderApiHost(provider)
  const configKey = `${provider.id}:${normalizedHost}:${provider.apiKey}:${provider.apiVersion || ''}`

  if (!cachedClient || cachedConfig !== configKey) {
    cachedClient = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: normalizedHost
    })
    cachedConfig = configKey
  }

  return cachedClient
}

export const getCurrentModel = (options: ProviderSelectionOptions = {}): string => {
  try {
    return resolveProviderSelection(options).modelId
  } catch {
    return DEFAULT_MODEL
  }
}

export const getEnabledProviders = (): Provider[] => {
  const providers = providerDB.getProviders()
  return providers.filter((p) => p.enabled)
}

function createProviderModel(
  provider: Provider,
  providerModelId: string,
  name = providerModelId
): Model {
  return {
    id: `${provider.id}:${providerModelId}`,
    providerId: provider.id,
    providerModelId,
    name,
    capabilities: inferModelCapabilities(providerModelId, provider.id, name),
    createdAt: Date.now()
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readResponseError(data: unknown): string | undefined {
  const error = asRecord(data).error
  if (typeof error === 'string') return error
  const message = asRecord(error).message
  return readString(message)
}

function readModelIdentifier(item: unknown): string | undefined {
  const record = asRecord(item)
  return readString(record.id) || readString(record.name) || readString(record.model)
}

function supportsGenerateContent(item: unknown): boolean {
  return asArray(asRecord(item).supportedGenerationMethods).includes('generateContent')
}

export async function fetchProviderModels(provider: Provider): Promise<Model[]> {
  const modelsUrl = buildProviderModelsUrl(provider)
  if (!modelsUrl) throw new Error('API Host is required.')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.config?.extra_headers || {})
  }

  if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey || ''
    headers['anthropic-version'] = provider.apiVersion || '2023-06-01'
  } else if (provider.apiKey && provider.type !== 'gemini') {
    headers.Authorization = `Bearer ${provider.apiKey}`
  }

  const url =
    provider.type === 'gemini' && provider.apiKey
      ? `${modelsUrl}?key=${encodeURIComponent(provider.apiKey)}`
      : modelsUrl

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_CONNECTION_TIMEOUT_MS)

  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    const data: unknown = await response.json().catch(() => ({}))
    const payload = asRecord(data)
    if (!response.ok) {
      const errorMsg = readResponseError(data) || response.statusText
      throw new Error(`HTTP ${response.status}: ${errorMsg}`)
    }

    if (provider.type === 'ollama') {
      const items = asArray(payload.models)
      return items
        .map(readModelIdentifier)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        .map((id) => createProviderModel(provider, id))
    }

    if (provider.type === 'gemini') {
      const items = asArray(payload.models)
      return items
        .filter(supportsGenerateContent)
        .map((item) => readString(asRecord(item).name)?.replace(/^models\//, '') || '')
        .filter((id: string) => id.length > 0)
        .map((id: string) => createProviderModel(provider, id, id))
    }

    const items = asArray(payload.data).length > 0 ? asArray(payload.data) : asArray(payload.models)
    return items
      .map(readModelIdentifier)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      .map((id) => createProviderModel(provider, id))
  } finally {
    clearTimeout(timeoutId)
  }
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
- **自主环境管理**：如果需要可视交互或跨主机操作，主动使用 \`manage_terminal\`。
- **命令与终端分层**：普通非交互命令使用 \`execute_command({ workdir })\`，它会在 Agent 专用可视终端中执行，用户能实时看到输入和输出；不要为了切目录写 \`cd <dir> && command\`，优先传 \`workdir\`。TUI、安装器、REPL、菜单和需要键盘选择的长会话使用终端自动化工具。
- **TUI 自动化**：遇到交互式安装器、菜单、编辑器、REPL、全屏 TUI 或需要键盘选择的软件时，不要用 \`execute_command\` 等待它结束。推荐流程是 \`observe_terminal -> send_terminal_keys(submit=true 或 keys:["Enter"]) -> wait_terminal_activity -> observe_terminal(includeHistory=true)\`。如果 \`wait_terminal_activity\` 返回 \`stable_output\` 或 \`awaiting_input\`，应基于屏幕和最近变化总结或请求输入，不要继续盲等同类工具；若返回 \`timeout\`，报告“仍在运行/无法确认完成/需要用户接管”。
- **网页搜索**：需要实时资料、第三方文档、版本发布信息、当前事件或模型知识截止后的事实时，优先使用 \`websearch\`。该搜索从 OpenTerm App 所在网络发出；如果需要确认 SSH 远程主机自身的网络视角，改用 \`execute_command\` 在目标主机运行 \`curl\`、\`dig\` 等只读命令。
- **记忆与检索**：利用 \`search_memory\` 获取历史习惯，利用 \`read_file\` 获取复杂配置。
- **失败恢复**：如果命令执行失败，在 Thought 中分析原因并尝试替代方案（Retry/Re-plan），不要轻易放弃。

### Agent 备注功能：
你可以使用 \`read_notes\` 和 \`write_notes\` 工具来记录和维护主机、终端的备注信息。

**何时记录备注：**
- 发现新主机时，记录主机配置和用途
- 创建终端时，记录终端用途和初始状态
- 执行长时间任务时，记录任务进度和关键信息
- 发现重要信息时（如错误、警告、配置细节）

**何时读取备注：**
- 回复用户前，查看相关主机/终端的备注了解背景
- 执行命令前，了解当前状态和注意事项
- 用户询问"之前做了什么"或"任务进度如何"时

**备注格式建议：**
- 用途：这个主机/终端用来干什么
- 当前：现在正在做什么
- 进度：任务进度（如果有）
- 注意：需要关注的事项
- 最后更新：时间戳

### 历史记录查询功能：
你可以使用 \`search_terminal_history\` 和 \`get_deleted_terminals\` 工具来查询终端历史记录。

**何时查询历史：**
- 用户问"我之前做了什么"、"找一下之前的命令"时
- 需要查看已删除终端的活动记录时
- 需要追溯历史操作或审计时

**注意事项：**
- 终端关闭后，其命令历史仍然保留（软删除）
- 可以使用 \`search_terminal_history\` 搜索所有终端（包括已删除）的命令
- 可以使用 \`get_deleted_terminals\` 查看已删除的终端列表

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
    const models = getModelsWithPresets(provider.id)
    let testModel = modelId || (models.length > 0 ? getModelApiId(models[0]) : '')

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
      'Content-Type': 'application/json',
      ...(provider.config?.extra_headers || {})
    }

    let body: Record<string, unknown> = {}

    if (provider.type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey || ''
      headers['anthropic-version'] = provider.apiVersion || '2023-06-01'
      body = {
        model: testModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }
    } else if (provider.type === 'gemini') {
      // Gemini specific quick test
      const geminiModel = testModel || 'gemini-1.5-flash'
      const rawHost = provider.apiHost.trim().replace(/\/+$/, '')
      const testUrl = `${rawHost}/v1beta/models/${geminiModel}:generateContent?key=${provider.apiKey || ''}`
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      })
      const data: unknown = await response.json().catch(() => ({}))
      const errorMessage = readResponseError(data)
      if (errorMessage) return { ok: false, message: errorMessage || 'Gemini API Error' }
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

      const data: unknown = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorMsg = readResponseError(data) || response.statusText
        return { ok: false, message: `HTTP ${response.status}: ${errorMsg}` }
      }

      const errorMessage = readResponseError(data)
      if (errorMessage) {
        return { ok: false, message: errorMessage || 'API error' }
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
