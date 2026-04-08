import { useCallback, useMemo, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import type { Provider, Model, SystemProviderId } from '../../../shared/types'
import type { RootState, AppDispatch } from '../store'
import {
  addProvider,
  updateProvider,
  removeProvider,
  setProviderEnabled,
  addModel,
  updateModel,
  removeModel,
  setDefaultProvider,
  setDefaultModel,
  updateSystemProvider,
  loadProvidersFromDB,
  loadModelsFromDB
} from '../store/llm'
import { getSystemProvider, isSystemProviderId } from '../config/providers'

export function useProvider() {
  const dispatch = useDispatch<AppDispatch>()

  const providers = useSelector((state: RootState) => state.llm.providers)
  const models = useSelector((state: RootState) => state.llm.models)
  const defaultProviderId = useSelector((state: RootState) => state.llm.defaultProviderId)
  const defaultModelId = useSelector((state: RootState) => state.llm.defaultModelId)
  const loading = useSelector((state: RootState) => state.llm.loading)
  const error = useSelector((state: RootState) => state.llm.error)

  useEffect(() => {
    dispatch(loadProvidersFromDB())
    dispatch(loadModelsFromDB())
  }, [dispatch])

  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers])

  const defaultProvider = useMemo(
    () => providers.find((p) => p.id === defaultProviderId) || null,
    [providers, defaultProviderId]
  )

  const defaultModel = useMemo(
    () => models.find((m) => m.id === defaultModelId) || null,
    [models, defaultModelId]
  )

  const getProviderById = useCallback(
    (id: string) => providers.find((p) => p.id === id),
    [providers]
  )

  const getModelsByProvider = useCallback(
    (providerId: string) => models.filter((m) => m.providerId === providerId),
    [models]
  )

  const getProviderModels = useCallback(
    (providerId: string) => {
      const provider = getProviderById(providerId)
      if (!provider) return []
      return getModelsByProvider(providerId)
    },
    [getProviderById, getModelsByProvider]
  )

  const createProvider = useCallback(
    async (provider: Omit<Provider, 'createdAt' | 'updatedAt'>) => {
      const newProvider: Provider = {
        ...provider,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      await window.api.saveProvider(newProvider)
      dispatch(addProvider(newProvider))
      return newProvider
    },
    [dispatch]
  )

  const updateProviderById = useCallback(
    async (id: string, updates: Partial<Provider>) => {
      const provider = getProviderById(id)
      if (!provider) return null

      const updatedProvider = { ...provider, ...updates, updatedAt: Date.now() }
      await window.api.saveProvider(updatedProvider)

      if (provider.isSystem && isSystemProviderId(id)) {
        dispatch(updateSystemProvider({ id: id as SystemProviderId, updates }))
      } else {
        dispatch(updateProvider(updatedProvider))
      }
      return updatedProvider
    },
    [dispatch, getProviderById]
  )

  const deleteProvider = useCallback(
    async (id: string) => {
      const provider = getProviderById(id)
      if (provider && !provider.isSystem) {
        await window.api.deleteProvider(id)
        dispatch(removeProvider(id))
        return true
      }
      return false
    },
    [dispatch, getProviderById]
  )

  const toggleProviderEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const provider = getProviderById(id)
      if (provider) {
        const updated = { ...provider, enabled, updatedAt: Date.now() }
        await window.api.saveProvider(updated)
        dispatch(setProviderEnabled({ id, enabled }))
      }
    },
    [dispatch, getProviderById]
  )

  const resetSystemProvider = useCallback(
    (id: SystemProviderId) => {
      const systemProvider = getSystemProvider(id)
      if (systemProvider) {
        dispatch(updateProvider(systemProvider))
        return systemProvider
      }
      return null
    },
    [dispatch]
  )

  const createModel = useCallback(
    (model: Omit<Model, 'createdAt'>) => {
      const newModel: Model = {
        ...model,
        createdAt: Date.now()
      }
      dispatch(addModel(newModel))
      return newModel
    },
    [dispatch]
  )

  const updateModelById = useCallback(
    (providerId: string, modelId: string, updates: Partial<Model>) => {
      const model = models.find((m) => m.id === modelId && m.providerId === providerId)
      if (!model) return null
      dispatch(updateModel({ ...model, ...updates }))
      return { ...model, ...updates }
    },
    [dispatch, models]
  )

  const deleteModel = useCallback(
    (providerId: string, modelId: string) => {
      dispatch(removeModel({ id: modelId, providerId }))
    },
    [dispatch]
  )

  const setDefaultProviderById = useCallback(
    (id: string | null) => {
      dispatch(setDefaultProvider(id))
    },
    [dispatch]
  )

  const setDefaultModelById = useCallback(
    (id: string | null) => {
      dispatch(setDefaultModel(id))
    },
    [dispatch]
  )

  const isProviderSystem = useCallback((id: string) => {
    return isSystemProviderId(id)
  }, [])

  return {
    providers,
    enabledProviders,
    models,
    defaultProvider,
    defaultModel,
    defaultProviderId,
    defaultModelId,
    loading,
    error,
    getProviderById,
    getModelsByProvider,
    getProviderModels,
    createProvider,
    updateProvider: updateProviderById,
    deleteProvider,
    toggleProviderEnabled,
    resetSystemProvider,
    createModel,
    updateModel: updateModelById,
    deleteModel,
    setDefaultProvider: setDefaultProviderById,
    setDefaultModel: setDefaultModelById,
    isProviderSystem
  }
}
