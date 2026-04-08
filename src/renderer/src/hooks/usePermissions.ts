import { useState, useEffect, useCallback } from 'react'
import type { PermissionSettings } from '../../../shared/types'

const DEFAULT_PERMISSIONS: PermissionSettings = {
  requireConfirmation: true,
  autoExecuteSafeOperations: true,
  updatedAt: Date.now()
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionSettings>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    try {
      setLoading(true)
      const savedPermissions = await window.api.getPermissions()
      setPermissions(savedPermissions)
    } catch (error) {
      console.error('Failed to load permissions:', error)
      setPermissions(DEFAULT_PERMISSIONS)
    } finally {
      setLoading(false)
    }
  }

  const updatePermissions = useCallback(async (updates: Partial<PermissionSettings>) => {
    try {
      const newPermissions = { ...permissions, ...updates, updatedAt: Date.now() }
      await window.api.savePermissions(updates)
      setPermissions(newPermissions)
      return true
    } catch (error) {
      console.error('Failed to save permissions:', error)
      return false
    }
  }, [permissions])

  const toggleRequireConfirmation = useCallback(async () => {
    return updatePermissions({ requireConfirmation: !permissions.requireConfirmation })
  }, [permissions.requireConfirmation, updatePermissions])

  const toggleAutoExecuteSafeOperations = useCallback(async () => {
    return updatePermissions({ autoExecuteSafeOperations: !permissions.autoExecuteSafeOperations })
  }, [permissions.autoExecuteSafeOperations, updatePermissions])

  return {
    permissions,
    loading,
    updatePermissions,
    toggleRequireConfirmation,
    toggleAutoExecuteSafeOperations,
    requireConfirmation: permissions.requireConfirmation,
    autoExecuteSafeOperations: permissions.autoExecuteSafeOperations,
    refresh: loadPermissions
  }
}
