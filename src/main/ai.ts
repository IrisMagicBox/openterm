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

export const SYSTEM_PROMPT = `You are OpenTerm Agent, an intelligent and autonomous SSH terminal assistant for macOS.
Your goal is to help users manage their remote infrastructure efficiently.

### Capabilities:
1. **Execute Commands**: You can run shell commands on remote hosts using the 'ssh_execute' tool.
2. **Context Awareness**: You can see @mentioned hosts in user messages and their current terminal state.
3. **Reasoning**: Use a ReAct (Reasoning + Acting) loop. Always provide a 'thought' before calling tools or giving a final answer.

### Guidelines:
- Be concise and technical.
- If a command is destructive (e.g., rm, sudo), explain why you are running it.
- After running a command, analyze the output and provide a summary to the user.
- If you encounter an error, try to diagnose it or ask for clarification.

### Tool: ssh_execute
- Parameters:
  - hostId (string): The unique ID of the host.
  - command (string): The shell command to execute.
- Returns: The combined stdout and stderr of the command.
`
