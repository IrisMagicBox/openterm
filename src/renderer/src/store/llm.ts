import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import type { Provider, Model, SystemProviderId } from '../../../shared/types'
import {
  SYSTEM_MODELS,
  SYSTEM_PROVIDERS_CONFIG,
  getModelApiId,
  inferModelCapabilities
} from '../config/providers'

export interface LLMState {
  providers: Provider[]
  models: Model[]
  defaultProviderId: string | null
  defaultModelId: string | null
  loading: boolean
  error: string | null
}

const initialState: LLMState = {
  providers: Object.values(SYSTEM_PROVIDERS_CONFIG),
  models: SYSTEM_MODELS,
  defaultProviderId: null,
  defaultModelId: null,
  loading: false,
  error: null
}

function hydrateModel(model: Model, preset?: Model): Model {
  const apiModelId = model.providerModelId || preset?.providerModelId || getModelApiId(model)
  return {
    ...preset,
    ...model,
    providerModelId: apiModelId,
    capabilities:
      model.capabilities && model.capabilities.length > 0
        ? model.capabilities
        : preset?.capabilities || inferModelCapabilities(apiModelId, model.providerId, model.name),
    createdAt: model.createdAt || preset?.createdAt || Date.now()
  }
}

function mergeModelsWithPresets(dbModels: Model[]): Model[] {
  const byId = new Map<string, Model>()
  for (const preset of SYSTEM_MODELS) {
    byId.set(preset.id, preset)
  }
  for (const model of dbModels) {
    byId.set(model.id, hydrateModel(model, byId.get(model.id)))
  }
  return Array.from(byId.values())
}

const llmSlice = createSlice({
  name: 'llm',
  initialState,
  reducers: {
    setProviders: (state, action: PayloadAction<Provider[]>) => {
      state.providers = action.payload
    },

    addProvider: (state, action: PayloadAction<Provider>) => {
      const exists = state.providers.find((p) => p.id === action.payload.id)
      if (!exists) {
        state.providers.push(action.payload)
      }
    },

    updateProvider: (state, action: PayloadAction<Provider>) => {
      const index = state.providers.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        state.providers[index] = {
          ...state.providers[index],
          ...action.payload,
          updatedAt: Date.now()
        }
      }
    },

    removeProvider: (state, action: PayloadAction<string>) => {
      const provider = state.providers.find((p) => p.id === action.payload)
      if (provider && !provider.isSystem) {
        state.providers = state.providers.filter((p) => p.id !== action.payload)
        state.models = state.models.filter((m) => m.providerId !== action.payload)
      }
    },

    setProviderEnabled: (state, action: PayloadAction<{ id: string; enabled: boolean }>) => {
      const provider = state.providers.find((p) => p.id === action.payload.id)
      if (provider) {
        provider.enabled = action.payload.enabled
        provider.updatedAt = Date.now()
      }
    },

    setModels: (state, action: PayloadAction<Model[]>) => {
      state.models = action.payload
    },

    addModel: (state, action: PayloadAction<Model>) => {
      const exists = state.models.find(
        (m) => m.id === action.payload.id && m.providerId === action.payload.providerId
      )
      if (!exists) {
        state.models.push(action.payload)
      }
    },

    updateModel: (state, action: PayloadAction<Model>) => {
      const index = state.models.findIndex(
        (m) => m.id === action.payload.id && m.providerId === action.payload.providerId
      )
      if (index !== -1) {
        state.models[index] = action.payload
      }
    },

    removeModel: (state, action: PayloadAction<{ id: string; providerId: string }>) => {
      state.models = state.models.filter(
        (m) => !(m.id === action.payload.id && m.providerId === action.payload.providerId)
      )
    },

    setDefaultProvider: (state, action: PayloadAction<string | null>) => {
      state.defaultProviderId = action.payload
    },

    setDefaultModel: (state, action: PayloadAction<string | null>) => {
      state.defaultModelId = action.payload
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    resetToDefaults: (state) => {
      state.providers = Object.values(SYSTEM_PROVIDERS_CONFIG)
      state.models = SYSTEM_MODELS
      state.defaultProviderId = null
      state.defaultModelId = null
    },

    updateSystemProvider: (
      state,
      action: PayloadAction<{ id: SystemProviderId; updates: Partial<Provider> }>
    ) => {
      const index = state.providers.findIndex((p) => p.id === action.payload.id)
      if (index !== -1 && state.providers[index].isSystem) {
        state.providers[index] = {
          ...state.providers[index],
          ...action.payload.updates,
          updatedAt: Date.now()
        }
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadProvidersFromDB.pending, (state) => {
        state.loading = true
      })
      .addCase(loadProvidersFromDB.fulfilled, (state, action) => {
        state.providers = action.payload
        state.loading = false
      })
      .addCase(loadProvidersFromDB.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to load providers'
      })
      .addCase(loadModelsFromDB.fulfilled, (state, action) => {
        state.models = action.payload
      })
      .addCase(loadModelSettingsFromDB.fulfilled, (state, action) => {
        state.defaultProviderId = action.payload.defaultProviderId ?? null
        state.defaultModelId = action.payload.defaultModelId ?? null
      })
  }
})

export const {
  setProviders,
  addProvider,
  updateProvider,
  removeProvider,
  setProviderEnabled,
  setModels,
  addModel,
  updateModel,
  removeModel,
  setDefaultProvider,
  setDefaultModel,
  setLoading,
  setError,
  resetToDefaults,
  updateSystemProvider
} = llmSlice.actions

export const loadProvidersFromDB = createAsyncThunk('llm/loadProviders', async () => {
  const dbProviders = await window.api.getProviders()
  const systemProviders = Object.values(SYSTEM_PROVIDERS_CONFIG)

  const mergedProviders = systemProviders.map((sysProvider) => {
    const dbProvider = dbProviders.find((p) => p.id === sysProvider.id)
    return dbProvider
      ? {
          ...dbProvider,
          ...sysProvider,
          // Keep user settings from DB
          apiKey: dbProvider.apiKey || sysProvider.apiKey,
          enabled: dbProvider.enabled,
          apiHost: dbProvider.apiHost || sysProvider.apiHost,
          apiVersion: dbProvider.apiVersion || sysProvider.apiVersion,
          config: dbProvider.config || sysProvider.config
        }
      : sysProvider
  })

  const customProviders = dbProviders.filter(
    (p) =>
      !SYSTEM_PROVIDERS_CONFIG[p.id as keyof typeof SYSTEM_PROVIDERS_CONFIG] &&
      !systemProviders.some((sp) => sp.name === p.name)
  )

  return [...mergedProviders, ...customProviders]
})

export const loadModelsFromDB = createAsyncThunk('llm/loadModels', async () => {
  const models = await window.api.getModels()
  return mergeModelsWithPresets(models)
})

export const loadModelSettingsFromDB = createAsyncThunk('llm/loadModelSettings', async () => {
  return window.api.getModelSettings()
})

export default llmSlice.reducer
