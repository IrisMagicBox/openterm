import type { SystemProviderId, Provider } from '../../../shared/types'

export interface SystemProvider extends Provider {
  id: SystemProviderId
  isSystem: true
}

export const SYSTEM_PROVIDERS_CONFIG: Record<SystemProviderId, SystemProvider> = {
  coreshub: {
    id: 'coreshub',
    name: 'CoresHub',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://openapi.coreshub.cn/v1',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.openai.com',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  gemini: {
    id: 'gemini',
    name: 'Gemini',
    type: 'gemini',
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  'azure-openai': {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    type: 'azure-openai',
    apiKey: '',
    apiHost: '',
    apiVersion: '',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    apiKey: '',
    apiHost: 'http://localhost:11434',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'openai',
    apiKey: '',
    apiHost: 'http://localhost:1234',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.deepseek.com',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  silicon: {
    id: 'silicon',
    name: 'Silicon Flow',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.siliconflow.cn',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.minimaxi.com/v1/',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.groq.com/openai',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  mistral: {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.mistral.ai',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  together: {
    id: 'together',
    name: 'Together AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.together.xyz',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  fireworks: {
    id: 'fireworks',
    name: 'Fireworks',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.fireworks.ai/inference',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://integrate.api.nvidia.com',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  grok: {
    id: 'grok',
    name: 'Grok',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.x.ai',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  'aws-bedrock': {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    type: 'aws-bedrock',
    apiKey: '',
    apiHost: '',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  vertexai: {
    id: 'vertexai',
    name: 'Vertex AI',
    type: 'vertexai',
    apiKey: '',
    apiHost: '',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  github: {
    id: 'github',
    name: 'GitHub Models',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://models.github.ai/inference',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.githubcopilot.com/',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://openrouter.ai/api/v1/',
    enabled: false,
    isSystem: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

}

export const SYSTEM_PROVIDERS: SystemProvider[] = Object.values(SYSTEM_PROVIDERS_CONFIG)

export function getSystemProvider(id: SystemProviderId): SystemProvider | undefined {
  return SYSTEM_PROVIDERS_CONFIG[id]
}

export function isSystemProviderId(id: string): id is SystemProviderId {
  return id in SYSTEM_PROVIDERS_CONFIG
}

export const PROVIDER_URLS: Record<
  SystemProviderId,
  {
    api: { url: string }
    websites?: {
      official: string
      apiKey?: string
      docs?: string
      models?: string
    }
  }
> = {
  coreshub: {
    api: { url: 'https://openapi.coreshub.cn/v1' },
    websites: {
      official: 'https://coreshub.cn',
      apiKey: 'https://coreshub.cn',
      docs: 'https://coreshub.cn',
      models: 'https://coreshub.cn'
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
      official: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
      apiKey:
        'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI',
      docs: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
      models: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models'
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
  deepseek: {
    api: { url: 'https://api.deepseek.com' },
    websites: {
      official: 'https://deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys',
      docs: 'https://platform.deepseek.com/api-docs/',
      models: 'https://platform.deepseek.com/api-docs/'
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
    api: { url: 'https://api.minimaxi.com/v1/' },
    websites: {
      official: 'https://platform.minimaxi.com/',
      apiKey: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
      docs: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api',
      models: 'https://platform.minimaxi.com/document/Models'
    }
  },
  groq: {
    api: { url: 'https://api.groq.com/openai' },
    websites: {
      official: 'https://groq.com/',
      apiKey: 'https://console.groq.com/keys',
      docs: 'https://console.groq.com/docs/quickstart',
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
      docs: 'https://docs.together.ai/docs/introduction',
      models: 'https://docs.together.ai/docs/serverless-models'
    }
  },
  fireworks: {
    api: { url: 'https://api.fireworks.ai/inference' },
    websites: {
      official: 'https://fireworks.ai/',
      apiKey: 'https://fireworks.ai/account/api-keys',
      docs: 'https://docs.fireworks.ai/getting-started/introduction',
      models: 'https://fireworks.ai/dashboard/models'
    }
  },
  nvidia: {
    api: { url: 'https://integrate.api.nvidia.com' },
    websites: {
      official: 'https://build.nvidia.com/explore/discover',
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
  'aws-bedrock': {
    api: { url: '' },
    websites: {
      official: 'https://aws.amazon.com/bedrock/',
      apiKey: 'https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html',
      docs: 'https://docs.aws.amazon.com/bedrock/',
      models: 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html'
    }
  },
  vertexai: {
    api: { url: '' },
    websites: {
      official: 'https://cloud.google.com/vertex-ai',
      apiKey: 'https://console.cloud.google.com/apis/credentials',
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
    api: { url: 'https://api.githubcopilot.com/' },
    websites: {
      official: 'https://github.com/features/copilot',
      docs: 'https://docs.github.com/en/copilot'
    }
  },
  openrouter: {
    api: { url: 'https://openrouter.ai/api/v1/' },
    websites: {
      official: 'https://openrouter.ai/',
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs/quick-start',
      models: 'https://openrouter.ai/models'
    }
  },
}
