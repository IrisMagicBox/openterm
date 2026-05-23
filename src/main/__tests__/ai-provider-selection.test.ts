import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, ModelSettings, Provider, Topic } from '../../shared/types'

const mocks = vi.hoisted(() => ({
  providerDB: {
    getProviders: vi.fn()
  },
  modelDB: {
    getModels: vi.fn()
  },
  modelSettingsDB: {
    getSettings: vi.fn()
  },
  topicDB: {
    getTopicById: vi.fn()
  }
}))

vi.mock('../db', () => mocks)

import { resolveProviderSelection } from '../ai'

function provider(id: string): Provider {
  return {
    id,
    name: id,
    type: 'openai',
    apiKey: '',
    apiHost: 'https://example.com',
    enabled: true,
    isSystem: false,
    createdAt: 1,
    updatedAt: 1
  }
}

function model(providerId: string, id: string, providerModelId = id): Model {
  return {
    id: `${providerId}:${id}`,
    providerId,
    providerModelId,
    name: id,
    capabilities: ['text', 'tool-use'],
    createdAt: 1
  }
}

function topic(overrides: Partial<Topic>): Topic {
  return {
    id: 'topic-1',
    title: 'Topic',
    hostIds: [],
    lastMessageAt: 1,
    createdAt: 1,
    ...overrides
  }
}

function settings(overrides: Partial<ModelSettings> = {}): ModelSettings {
  return {
    id: 'default',
    apiKey: '',
    baseURL: 'https://example.com',
    model: 'legacy-model',
    terminalCompletionMode: 'prompt',
    updatedAt: 1,
    ...overrides
  }
}

describe('resolveProviderSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.providerDB.getProviders.mockReturnValue([provider('primary'), provider('secondary')])
    mocks.modelDB.getModels.mockImplementation((providerId: string) => [
      model(providerId, 'first-model'),
      model(providerId, 'default-model')
    ])
    mocks.modelSettingsDB.getSettings.mockReturnValue(settings())
    mocks.topicDB.getTopicById.mockReturnValue(undefined)
  })

  it('uses the configured global default model when the topic has no model override', () => {
    mocks.modelSettingsDB.getSettings.mockReturnValue(
      settings({
        defaultProviderId: 'secondary',
        defaultModelId: 'secondary:default-model'
      })
    )

    const selection = resolveProviderSelection({ topicId: 'topic-1' })

    expect(selection.provider.id).toBe('secondary')
    expect(selection.modelRecordId).toBe('secondary:default-model')
    expect(selection.modelId).toBe('default-model')
  })

  it('lets the topic selected model override the global default model', () => {
    mocks.topicDB.getTopicById.mockReturnValue(
      topic({
        selectedProviderId: 'primary',
        selectedModelId: 'primary:first-model'
      })
    )
    mocks.modelSettingsDB.getSettings.mockReturnValue(
      settings({
        defaultProviderId: 'secondary',
        defaultModelId: 'secondary:default-model'
      })
    )

    const selection = resolveProviderSelection({ topicId: 'topic-1' })

    expect(selection.provider.id).toBe('primary')
    expect(selection.modelRecordId).toBe('primary:first-model')
    expect(selection.modelId).toBe('first-model')
  })

  it('falls back to the first usable enabled model when the global default is unavailable', () => {
    mocks.modelSettingsDB.getSettings.mockReturnValue(
      settings({
        defaultProviderId: 'disabled-provider',
        defaultModelId: 'disabled-provider:default-model'
      })
    )

    const selection = resolveProviderSelection({ topicId: 'topic-1' })

    expect(selection.provider.id).toBe('primary')
    expect(selection.modelRecordId).toBe('primary:first-model')
  })
})
