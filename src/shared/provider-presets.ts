import type { Model, ModelCapability, Provider, SystemProviderId } from './types'

export interface SystemProvider extends Provider {
  id: SystemProviderId
  isSystem: true
}

export interface ModelCapabilities {
  toolCalling: boolean
  parallelToolCalls: boolean
  streaming: boolean
  reasoning: boolean
  promptCaching: boolean
  vision: boolean
  temperature: boolean
  contextWindow: number
  maxOutputTokens: number
}

type ProviderUrlInfo = {
  api: { url: string }
  websites?: {
    official: string
    apiKey?: string
    docs?: string
    models?: string
  }
}

const SYSTEM_PRESET_TIMESTAMP = 0

function provider(
  id: SystemProviderId,
  name: string,
  type: Provider['type'],
  apiHost: string,
  extras: Partial<Omit<SystemProvider, 'id' | 'name' | 'type' | 'apiHost'>> = {}
): SystemProvider {
  return {
    id,
    name,
    type,
    apiKey: '',
    apiHost,
    enabled: false,
    isSystem: true,
    createdAt: SYSTEM_PRESET_TIMESTAMP,
    updatedAt: SYSTEM_PRESET_TIMESTAMP,
    ...extras
  }
}

export const SYSTEM_PROVIDERS_CONFIG: Record<SystemProviderId, SystemProvider> = {
  coreshub: provider('coreshub', 'CoresHub', 'openai', 'https://openapi.coreshub.cn/v1'),
  openai: provider('openai', 'OpenAI', 'openai', 'https://api.openai.com'),
  anthropic: provider('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com'),
  gemini: provider('gemini', 'Gemini', 'gemini', 'https://generativelanguage.googleapis.com'),
  'azure-openai': provider('azure-openai', 'Azure OpenAI', 'azure-openai', '', {
    apiVersion: ''
  }),
  ollama: provider('ollama', 'Ollama', 'ollama', 'http://localhost:11434'),
  lmstudio: provider('lmstudio', 'LM Studio', 'openai', 'http://localhost:1234'),
  openrouter: provider('openrouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1'),
  deepseek: provider('deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com'),
  silicon: provider('silicon', 'Silicon Flow', 'openai', 'https://api.siliconflow.cn'),
  minimax: provider('minimax', 'MiniMax', 'openai', 'https://api.minimaxi.com/v1'),
  groq: provider('groq', 'Groq', 'openai', 'https://api.groq.com/openai/v1'),
  mistral: provider('mistral', 'Mistral', 'openai', 'https://api.mistral.ai', {
    config: { apiOptions: { isNotSupportStreamOptions: true } }
  }),
  together: provider('together', 'Together AI', 'openai', 'https://api.together.xyz'),
  fireworks: provider('fireworks', 'Fireworks', 'openai', 'https://api.fireworks.ai/inference'),
  nvidia: provider('nvidia', 'NVIDIA', 'openai', 'https://integrate.api.nvidia.com'),
  grok: provider('grok', 'xAI', 'openai', 'https://api.x.ai'),
  hyperbolic: provider('hyperbolic', 'Hyperbolic', 'openai', 'https://api.hyperbolic.xyz'),
  jina: provider('jina', 'Jina AI', 'openai', 'https://api.jina.ai'),
  perplexity: provider('perplexity', 'Perplexity', 'openai', 'https://api.perplexity.ai'),
  modelscope: provider(
    'modelscope',
    'ModelScope',
    'openai',
    'https://api-inference.modelscope.cn/v1'
  ),
  hunyuan: provider(
    'hunyuan',
    'Tencent Hunyuan',
    'openai',
    'https://api.hunyuan.cloud.tencent.com'
  ),
  'baidu-cloud': provider(
    'baidu-cloud',
    'Baidu Qianfan',
    'openai',
    'https://qianfan.baidubce.com/v2'
  ),
  dashscope: provider(
    'dashscope',
    'Alibaba Bailian',
    'openai',
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  ),
  moonshot: provider('moonshot', 'Moonshot AI', 'openai', 'https://api.moonshot.cn'),
  zhipu: provider('zhipu', 'Zhipu AI', 'openai', 'https://open.bigmodel.cn/api/paas/v4'),
  doubao: provider('doubao', 'Doubao', 'openai', 'https://ark.cn-beijing.volces.com/api/v3'),
  baichuan: provider('baichuan', 'Baichuan AI', 'openai', 'https://api.baichuan-ai.com'),
  stepfun: provider('stepfun', 'StepFun', 'openai', 'https://api.stepfun.com'),
  yi: provider('yi', '01.AI', 'openai', 'https://api.lingyiwanwu.com'),
  ppio: provider('ppio', 'PPIO', 'openai', 'https://api.ppinfra.com/v3/openai'),
  'aws-bedrock': provider('aws-bedrock', 'AWS Bedrock', 'aws-bedrock', ''),
  vertexai: provider('vertexai', 'Vertex AI', 'vertexai', ''),
  github: provider('github', 'GitHub Models', 'openai', 'https://models.github.ai/inference'),
  copilot: provider('copilot', 'GitHub Copilot', 'openai', 'https://api.githubcopilot.com')
}

export const SYSTEM_PROVIDERS: SystemProvider[] = Object.values(SYSTEM_PROVIDERS_CONFIG)

const EMBEDDING_REGEX =
  /(?:^text-|embedding|embed|bge-|e5-|gte-|jina-clip|jina-embeddings|voyage-)/i
const RERANK_REGEX = /(?:rerank|re-rank|re-ranker|re-ranking|retrieval|retriever)/i
const IMAGE_REGEX =
  /(?:dall-e|gpt-image|imagen|image-generation|text-to-image|stable-diffusion|flux)/i
const VISION_REGEX = /(?:vision|gpt-4o|gpt-4\.1|gemini|claude|qwen.*vl|vl\b|llava|grok-vision)/i
const REASONING_REGEX =
  /(?:^o[134](?:[-\s]|$)|reason|reasoner|thinking|think|deepseek-r1|deepseek-reasoner|\br1\b|qwq|gpt-5|grok-4)/i
const TOOL_USE_REGEX =
  /(?:gpt-4|gpt-5|^o[34](?:[-\s]|$)|claude|gemini|qwen|deepseek|glm|grok|llama|mistral|mixtral|minimax|moonshot|kimi|doubao|hunyuan|step)/i

export function inferModelCapabilities(
  modelId: string,
  providerId?: string,
  name = modelId
): ModelCapability[] {
  const subject = `${modelId} ${name}`
  if (RERANK_REGEX.test(subject)) return ['rerank']
  if (EMBEDDING_REGEX.test(subject)) return ['embedding']
  if (IMAGE_REGEX.test(subject)) return ['image-generation']

  const capabilities: ModelCapability[] = ['text']
  if (VISION_REGEX.test(subject)) capabilities.push('vision')
  if (REASONING_REGEX.test(subject)) capabilities.push('reasoning')
  if (TOOL_USE_REGEX.test(subject) || providerId === 'anthropic') capabilities.push('tool-use')
  return capabilities
}

export function inferModelRuntimeCapabilities(
  modelId: string,
  providerId?: string,
  name = modelId,
  knownCapabilities = inferModelCapabilities(modelId, providerId, name)
): ModelCapabilities {
  const subject = `${modelId} ${name}`.toLowerCase()
  const text = knownCapabilities.includes('text')
  const toolCalling = knownCapabilities.includes('tool-use')

  return {
    toolCalling,
    parallelToolCalls: toolCalling && providerId !== 'anthropic',
    streaming: text,
    reasoning: knownCapabilities.includes('reasoning'),
    promptCaching: supportsPromptCaching(subject, providerId),
    vision: knownCapabilities.includes('vision'),
    temperature: supportsTemperature(subject, providerId),
    contextWindow: inferContextWindow(subject, providerId),
    maxOutputTokens: inferMaxOutputTokens(subject, providerId)
  }
}

function model(
  providerId: SystemProviderId,
  providerModelId: string,
  name = providerModelId,
  group?: string
): Model {
  return {
    id: `${providerId}:${providerModelId}`,
    providerId,
    providerModelId,
    name,
    group,
    capabilities: inferModelCapabilities(providerModelId, providerId, name),
    createdAt: SYSTEM_PRESET_TIMESTAMP
  }
}

export const SYSTEM_MODELS_CONFIG: Record<SystemProviderId, Model[]> = {
  coreshub: [],
  openai: [
    model('openai', 'gpt-5.2', 'GPT-5.2', 'GPT-5'),
    model('openai', 'gpt-4.1', 'GPT-4.1', 'GPT-4'),
    model('openai', 'gpt-4o', 'GPT-4o', 'GPT-4o'),
    model('openai', 'gpt-4o-mini', 'GPT-4o mini', 'GPT-4o'),
    model('openai', 'o3', 'o3', 'Reasoning'),
    model('openai', 'o4-mini', 'o4-mini', 'Reasoning')
  ],
  anthropic: [
    model('anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 'Claude 4'),
    model('anthropic', 'claude-opus-4-20250514', 'Claude Opus 4', 'Claude 4'),
    model('anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 'Claude 3.5')
  ],
  gemini: [
    model('gemini', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'Gemini'),
    model('gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'Gemini'),
    model('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', 'Gemini')
  ],
  'azure-openai': [],
  ollama: [
    model('ollama', 'llama3.2', 'Llama 3.2', 'Local'),
    model('ollama', 'qwen2.5-coder', 'Qwen2.5 Coder', 'Local')
  ],
  lmstudio: [],
  openrouter: [
    model('openrouter', 'openai/gpt-4o-mini', 'GPT-4o mini', 'OpenAI'),
    model('openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', 'Anthropic'),
    model('openrouter', 'deepseek/deepseek-chat', 'DeepSeek Chat', 'DeepSeek')
  ],
  deepseek: [
    model('deepseek', 'deepseek-chat', 'DeepSeek Chat', 'DeepSeek'),
    model('deepseek', 'deepseek-reasoner', 'DeepSeek Reasoner', 'DeepSeek')
  ],
  silicon: [
    model('silicon', 'deepseek-ai/DeepSeek-V3', 'DeepSeek V3', 'DeepSeek'),
    model('silicon', 'deepseek-ai/DeepSeek-R1', 'DeepSeek R1', 'DeepSeek'),
    model('silicon', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen2.5 Coder 32B', 'Qwen')
  ],
  minimax: [
    model('minimax', 'MiniMax-Text-01', 'MiniMax Text 01', 'MiniMax'),
    model('minimax', 'abab6.5s-chat', 'abab6.5s Chat', 'MiniMax')
  ],
  groq: [
    model('groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'Llama'),
    model('groq', 'llama3-8b-8192', 'Llama 3 8B', 'Llama')
  ],
  mistral: [
    model('mistral', 'mistral-large-latest', 'Mistral Large', 'Mistral'),
    model('mistral', 'codestral-latest', 'Codestral', 'Mistral')
  ],
  together: [
    model('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Llama 3.3 70B', 'Llama'),
    model('together', 'deepseek-ai/DeepSeek-R1', 'DeepSeek R1', 'DeepSeek')
  ],
  fireworks: [
    model(
      'fireworks',
      'accounts/fireworks/models/llama-v3p1-405b-instruct',
      'Llama 3.1 405B',
      'Llama'
    ),
    model('fireworks', 'accounts/fireworks/models/deepseek-r1', 'DeepSeek R1', 'DeepSeek')
  ],
  nvidia: [
    model('nvidia', 'meta/llama-3.1-405b-instruct', 'Llama 3.1 405B', 'Llama'),
    model('nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', 'Nemotron 70B', 'NVIDIA')
  ],
  grok: [model('grok', 'grok-4', 'Grok 4', 'xAI'), model('grok', 'grok-3', 'Grok 3', 'xAI')],
  hyperbolic: [
    model('hyperbolic', 'meta-llama/Meta-Llama-3.1-70B-Instruct', 'Llama 3.1 70B', 'Llama')
  ],
  jina: [
    model('jina', 'jina-embeddings-v3', 'Jina Embeddings v3', 'Embedding'),
    model('jina', 'jina-reranker-v2-base-multilingual', 'Jina Reranker v2', 'Rerank')
  ],
  perplexity: [
    model('perplexity', 'sonar', 'Sonar', 'Perplexity'),
    model('perplexity', 'sonar-pro', 'Sonar Pro', 'Perplexity')
  ],
  modelscope: [
    model('modelscope', 'Qwen/Qwen3-235B-A22B', 'Qwen3 235B', 'Qwen'),
    model('modelscope', 'deepseek-ai/DeepSeek-R1', 'DeepSeek R1', 'DeepSeek')
  ],
  hunyuan: [model('hunyuan', 'hunyuan-turbos-latest', 'Hunyuan TurboS', 'Hunyuan')],
  'baidu-cloud': [
    model('baidu-cloud', 'ernie-4.0-turbo-8k', 'ERNIE 4.0 Turbo', 'ERNIE'),
    model('baidu-cloud', 'ernie-x1-turbo-32k', 'ERNIE X1 Turbo', 'ERNIE')
  ],
  dashscope: [
    model('dashscope', 'qwen-plus', 'Qwen Plus', 'Qwen'),
    model('dashscope', 'qwen-max', 'Qwen Max', 'Qwen'),
    model('dashscope', 'qwen-turbo', 'Qwen Turbo', 'Qwen')
  ],
  moonshot: [
    model('moonshot', 'moonshot-v1-8k', 'Moonshot v1 8K', 'Moonshot'),
    model('moonshot', 'moonshot-v1-32k', 'Moonshot v1 32K', 'Moonshot'),
    model('moonshot', 'kimi-k2-0711-preview', 'Kimi K2', 'Kimi')
  ],
  zhipu: [
    model('zhipu', 'glm-4-plus', 'GLM-4 Plus', 'GLM'),
    model('zhipu', 'glm-4-air', 'GLM-4 Air', 'GLM')
  ],
  doubao: [
    model('doubao', 'doubao-1-5-pro-32k-250115', 'Doubao 1.5 Pro 32K', 'Doubao'),
    model('doubao', 'doubao-seed-1-6-250615', 'Doubao Seed 1.6', 'Doubao')
  ],
  baichuan: [model('baichuan', 'Baichuan4', 'Baichuan 4', 'Baichuan')],
  stepfun: [
    model('stepfun', 'step-2-16k', 'Step 2 16K', 'Step'),
    model('stepfun', 'step-1-8k', 'Step 1 8K', 'Step')
  ],
  yi: [
    model('yi', 'yi-large', 'Yi Large', '01.AI'),
    model('yi', 'yi-lightning', 'Yi Lightning', '01.AI')
  ],
  ppio: [
    model('ppio', 'deepseek/deepseek-v3-0324', 'DeepSeek V3', 'DeepSeek'),
    model('ppio', 'qwen/qwen3-235b-a22b', 'Qwen3 235B', 'Qwen')
  ],
  'aws-bedrock': [],
  vertexai: [],
  github: [
    model('github', 'openai/gpt-4o-mini', 'GPT-4o mini', 'OpenAI'),
    model('github', 'mistral-ai/mistral-large-2411', 'Mistral Large', 'Mistral')
  ],
  copilot: []
}

export const SYSTEM_MODELS: Model[] = Object.values(SYSTEM_MODELS_CONFIG).flat()

export function getSystemProvider(id: SystemProviderId): SystemProvider | undefined {
  return SYSTEM_PROVIDERS_CONFIG[id]
}

export function isSystemProviderId(id: string): id is SystemProviderId {
  return Object.prototype.hasOwnProperty.call(SYSTEM_PROVIDERS_CONFIG, id)
}

export function getSystemModels(providerId: string): Model[] {
  return isSystemProviderId(providerId) ? SYSTEM_MODELS_CONFIG[providerId] : []
}

export function getModelApiId(modelOrId: Pick<Model, 'id' | 'providerModelId'> | string): string {
  if (typeof modelOrId === 'string')
    return modelOrId.includes(':') ? modelOrId.split(':').slice(1).join(':') : modelOrId
  return modelOrId.providerModelId || getModelApiId(modelOrId.id)
}

export function isAgentUsableModel(model: Model): boolean {
  const capabilities =
    model.capabilities ?? inferModelCapabilities(getModelApiId(model), model.providerId, model.name)
  return (
    capabilities.includes('text') &&
    !capabilities.includes('embedding') &&
    !capabilities.includes('rerank')
  )
}

export function isAgentRuntimeProvider(provider: Pick<Provider, 'type'>): boolean {
  return provider.type === 'openai' || provider.type === 'anthropic' || provider.type === 'ollama'
}

function supportsTemperature(subject: string, providerId?: string): boolean {
  if (providerId === 'anthropic') return true
  return !/(?:^|[/\s])(?:o[134](?:-|$)|gpt-5)/i.test(subject)
}

function supportsPromptCaching(subject: string, providerId?: string): boolean {
  return (
    providerId === 'anthropic' ||
    providerId === 'gemini' ||
    /\b(gpt-4o|gpt-4\.1|gpt-5|claude|gemini)\b/i.test(subject)
  )
}

function inferContextWindow(subject: string, providerId?: string): number {
  if (/gpt-4\.1|gpt-5|gemini-2\.5|claude/.test(subject)) return 200_000
  if (/gpt-4o|o[134]|deepseek|qwen|glm|kimi|moonshot/.test(subject)) return 128_000
  if (/llama|mistral|mixtral/.test(subject)) return 32_000
  return providerId === 'anthropic' ? 200_000 : 128_000
}

function inferMaxOutputTokens(subject: string, providerId?: string): number {
  if (/gpt-5|gpt-4\.1|o[134]|claude|gemini-2\.5/.test(subject)) return 16_384
  if (providerId === 'anthropic') return 8_192
  return 4_096
}

export const PROVIDER_URLS: Record<SystemProviderId, ProviderUrlInfo> = {
  coreshub: {
    api: { url: 'https://openapi.coreshub.cn/v1' },
    websites: {
      official: 'https://coreshub.cn',
      apiKey: 'https://coreshub.cn',
      docs: 'https://coreshub.cn'
    }
  },
  openai: {
    api: { url: 'https://api.openai.com' },
    websites: {
      official: 'https://openai.com/',
      apiKey: 'https://platform.openai.com/api-keys',
      docs: 'https://platform.openai.com/docs',
      models: 'https://platform.openai.com/docs/models'
    }
  },
  anthropic: {
    api: { url: 'https://api.anthropic.com' },
    websites: {
      official: 'https://anthropic.com/',
      apiKey: 'https://console.anthropic.com/settings/keys',
      docs: 'https://docs.anthropic.com/en/docs',
      models: 'https://docs.anthropic.com/en/docs/about-claude/models'
    }
  },
  gemini: {
    api: { url: 'https://generativelanguage.googleapis.com' },
    websites: {
      official: 'https://gemini.google.com/',
      apiKey: 'https://aistudio.google.com/app/apikey',
      docs: 'https://ai.google.dev/gemini-api/docs',
      models: 'https://ai.google.dev/gemini-api/docs/models/gemini'
    }
  },
  'azure-openai': {
    api: { url: '' },
    websites: {
      official: 'https://azure.microsoft.com/products/ai-services/openai-service',
      apiKey: 'https://portal.azure.com/',
      docs: 'https://learn.microsoft.com/azure/ai-services/openai/',
      models: 'https://learn.microsoft.com/azure/ai-services/openai/concepts/models'
    }
  },
  ollama: {
    api: { url: 'http://localhost:11434' },
    websites: {
      official: 'https://ollama.com/',
      docs: 'https://github.com/ollama/ollama/tree/main/docs',
      models: 'https://ollama.com/library'
    }
  },
  lmstudio: {
    api: { url: 'http://localhost:1234' },
    websites: {
      official: 'https://lmstudio.ai/',
      docs: 'https://lmstudio.ai/docs',
      models: 'https://lmstudio.ai/models'
    }
  },
  openrouter: {
    api: { url: 'https://openrouter.ai/api/v1' },
    websites: {
      official: 'https://openrouter.ai/',
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs',
      models: 'https://openrouter.ai/models'
    }
  },
  deepseek: {
    api: { url: 'https://api.deepseek.com' },
    websites: {
      official: 'https://deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys',
      docs: 'https://platform.deepseek.com/api-docs/'
    }
  },
  silicon: {
    api: { url: 'https://api.siliconflow.cn' },
    websites: {
      official: 'https://www.siliconflow.cn',
      apiKey: 'https://cloud.siliconflow.cn/',
      docs: 'https://docs.siliconflow.cn/',
      models: 'https://cloud.siliconflow.cn/models'
    }
  },
  minimax: {
    api: { url: 'https://api.minimaxi.com/v1' },
    websites: {
      official: 'https://platform.minimaxi.com/',
      apiKey: 'https://platform.minimaxi.com/',
      docs: 'https://platform.minimaxi.com/docs'
    }
  },
  groq: {
    api: { url: 'https://api.groq.com/openai/v1' },
    websites: {
      official: 'https://groq.com/',
      apiKey: 'https://console.groq.com/keys',
      docs: 'https://console.groq.com/docs',
      models: 'https://console.groq.com/docs/models'
    }
  },
  mistral: {
    api: { url: 'https://api.mistral.ai' },
    websites: {
      official: 'https://mistral.ai',
      apiKey: 'https://console.mistral.ai/api-keys/',
      docs: 'https://docs.mistral.ai',
      models: 'https://docs.mistral.ai/getting-started/models/models_overview'
    }
  },
  together: {
    api: { url: 'https://api.together.xyz' },
    websites: {
      official: 'https://www.together.ai/',
      apiKey: 'https://api.together.ai/settings/api-keys',
      docs: 'https://docs.together.ai',
      models: 'https://docs.together.ai/docs/serverless-models'
    }
  },
  fireworks: {
    api: { url: 'https://api.fireworks.ai/inference' },
    websites: {
      official: 'https://fireworks.ai/',
      apiKey: 'https://fireworks.ai/account/api-keys',
      docs: 'https://docs.fireworks.ai',
      models: 'https://fireworks.ai/models'
    }
  },
  nvidia: {
    api: { url: 'https://integrate.api.nvidia.com' },
    websites: {
      official: 'https://build.nvidia.com/',
      apiKey: 'https://build.nvidia.com/',
      docs: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
      models: 'https://build.nvidia.com/nim'
    }
  },
  grok: {
    api: { url: 'https://api.x.ai' },
    websites: {
      official: 'https://x.ai/',
      docs: 'https://docs.x.ai/',
      models: 'https://docs.x.ai/docs/models'
    }
  },
  hyperbolic: {
    api: { url: 'https://api.hyperbolic.xyz' },
    websites: { official: 'https://www.hyperbolic.xyz/', docs: 'https://docs.hyperbolic.xyz/' }
  },
  jina: {
    api: { url: 'https://api.jina.ai' },
    websites: {
      official: 'https://jina.ai/',
      apiKey: 'https://jina.ai/',
      docs: 'https://jina.ai/docs'
    }
  },
  perplexity: {
    api: { url: 'https://api.perplexity.ai' },
    websites: {
      official: 'https://www.perplexity.ai/',
      apiKey: 'https://www.perplexity.ai/settings/api',
      docs: 'https://docs.perplexity.ai/'
    }
  },
  modelscope: {
    api: { url: 'https://api-inference.modelscope.cn/v1' },
    websites: {
      official: 'https://modelscope.cn/',
      apiKey: 'https://modelscope.cn/my/myaccesstoken',
      docs: 'https://modelscope.cn/docs'
    }
  },
  hunyuan: {
    api: { url: 'https://api.hunyuan.cloud.tencent.com' },
    websites: {
      official: 'https://cloud.tencent.com/product/hunyuan',
      docs: 'https://cloud.tencent.com/document/product/1729'
    }
  },
  'baidu-cloud': {
    api: { url: 'https://qianfan.baidubce.com/v2' },
    websites: {
      official: 'https://cloud.baidu.com/product/wenxinworkshop',
      docs: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html'
    }
  },
  dashscope: {
    api: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    websites: {
      official: 'https://bailian.console.aliyun.com/',
      apiKey: 'https://bailian.console.aliyun.com/',
      docs: 'https://help.aliyun.com/zh/model-studio/'
    }
  },
  moonshot: {
    api: { url: 'https://api.moonshot.cn' },
    websites: {
      official: 'https://www.moonshot.cn/',
      apiKey: 'https://platform.moonshot.cn/console/api-keys',
      docs: 'https://platform.moonshot.cn/docs'
    }
  },
  zhipu: {
    api: { url: 'https://open.bigmodel.cn/api/paas/v4' },
    websites: {
      official: 'https://www.bigmodel.cn/',
      apiKey: 'https://open.bigmodel.cn/usercenter/apikeys',
      docs: 'https://docs.bigmodel.cn/'
    }
  },
  doubao: {
    api: { url: 'https://ark.cn-beijing.volces.com/api/v3' },
    websites: {
      official: 'https://www.volcengine.com/product/doubao',
      docs: 'https://www.volcengine.com/docs/82379'
    }
  },
  baichuan: {
    api: { url: 'https://api.baichuan-ai.com' },
    websites: {
      official: 'https://www.baichuan-ai.com/',
      docs: 'https://platform.baichuan-ai.com/docs'
    }
  },
  stepfun: {
    api: { url: 'https://api.stepfun.com' },
    websites: { official: 'https://www.stepfun.com/', docs: 'https://platform.stepfun.com/docs' }
  },
  yi: {
    api: { url: 'https://api.lingyiwanwu.com' },
    websites: {
      official: 'https://www.lingyiwanwu.com/',
      docs: 'https://platform.lingyiwanwu.com/docs'
    }
  },
  ppio: {
    api: { url: 'https://api.ppinfra.com/v3/openai' },
    websites: { official: 'https://ppinfra.com/', docs: 'https://docs.ppinfra.com/' }
  },
  'aws-bedrock': {
    api: { url: '' },
    websites: {
      official: 'https://aws.amazon.com/bedrock/',
      docs: 'https://docs.aws.amazon.com/bedrock/',
      models: 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html'
    }
  },
  vertexai: {
    api: { url: '' },
    websites: {
      official: 'https://cloud.google.com/vertex-ai',
      docs: 'https://cloud.google.com/vertex-ai/generative-ai/docs',
      models: 'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models'
    }
  },
  github: {
    api: { url: 'https://models.github.ai/inference' },
    websites: {
      official: 'https://github.com/marketplace/models',
      apiKey: 'https://github.com/settings/tokens',
      docs: 'https://docs.github.com/en/github-models',
      models: 'https://github.com/marketplace/models'
    }
  },
  copilot: {
    api: { url: 'https://api.githubcopilot.com' },
    websites: {
      official: 'https://github.com/features/copilot',
      docs: 'https://docs.github.com/en/copilot'
    }
  }
}
